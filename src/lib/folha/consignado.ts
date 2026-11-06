// Comparação do arquivo do e-Consignado (parcelas que os bancos mandaram descontar) com o que a
// folha mensal descontou de fato, por colaborador. Mostra quem ficou com parcela sem desconto e por
// quê — base para chamar o colaborador e assinar o termo de ciência.

import type { EventoFolha, FuncionarioFolha } from "../parsers/folha-pagamento";
import type { ContratoConsignado } from "../parsers/econsignado";
import { parametrosDoAno } from "./parametros";

export type SituacaoConsignado =
  | "ok"
  | "parcial_limite" // descontou só até o limite de 35%
  | "sem_remuneracao" // não houve salário no mês (afastamento) — nada a descontar
  | "rescisao_sem_desconto" // desligado e a rescisão não descontou tudo — depende da garantia do contrato
  | "nao_descontado" // havia margem e mesmo assim não descontou tudo
  | "descontado_a_mais" // folha descontou mais do que o arquivo pede
  | "desconto_sem_contrato" // folha desconta e o colaborador não está no arquivo
  | "fora_da_folha" // contrato no arquivo, mas o colaborador não está na folha do mês
  | "sem_cadastro"; // CPF do arquivo não encontrado no cadastro

export const STATUS_SITUACAO: Record<SituacaoConsignado, "ok" | "alerta" | "erro" | "pendente"> = {
  ok: "ok",
  parcial_limite: "alerta",
  sem_remuneracao: "alerta",
  rescisao_sem_desconto: "pendente",
  nao_descontado: "erro",
  descontado_a_mais: "erro",
  desconto_sem_contrato: "erro",
  fora_da_folha: "alerta",
  sem_cadastro: "pendente",
};

export type LinhaConsignado = {
  cpf: string;
  matricula: string | null;
  nome: string;
  funcao: string;
  situacaoFolha: string;
  contratos: ContratoConsignado[];
  // Quanto a folha descontou de cada contrato (chave = número do contrato).
  descontoPorContrato: Record<string, number>;
  previsto: number;
  descontado: number;
  naoDescontado: number;
  limite: number | null;
  remuneracaoBruta: number; // vencimentos com incidência de INSS (salário + férias + 13º)
  inss: number;
  ir: number;
  pensao: number;
  situacao: SituacaoConsignado;
  detalhe: string;
};

const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOLERANCIA = 0.05;

// Desconto líquido do consignado no recibo: eventos 020xx + o 15577 (coluna de proventos) − o 15576
// (coluna de descontos). Nos meses de férias o ERP lança o par com o mesmo valor, que se anula.
function descontoConsignado(eventos: EventoFolha[]) {
  const soma = (filtro: (e: EventoFolha) => boolean) => eventos.filter(filtro).reduce((a, e) => a + e.valor, 0);
  return soma((e) => /^020\d\d$/.test(e.codigo)) + soma((e) => e.codigo === "15577") - soma((e) => e.codigo === "15576");
}

// Liga cada evento 020xx da folha (um por contrato) ao contrato do arquivo. Primeiro pelo valor
// exato da parcela; o que sobrar (desconto parcial, pelo limite) vai para o contrato cuja parcela
// é maior que o valor descontado — se houver mais de um, segue a ordem do ERP, que desconta do
// contrato mais antigo para o mais novo (o arquivo do portal vem do mais novo para o mais antigo).
export function distribuirDescontoPorContrato(contratos: ContratoConsignado[], eventos: EventoFolha[], totalDescontado: number) {
  const resultado: Record<string, number> = Object.fromEntries(contratos.map((c) => [c.contrato, 0]));
  const restantes = [...contratos].reverse();
  const valores = eventos
    .filter((e) => e.coluna === "desconto" && /^020\d\d$/.test(e.codigo))
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((e) => e.valor);
  const sobras: number[] = [];
  for (const v of valores) {
    const i = restantes.findIndex((c) => Math.abs(c.valorParcela - v) <= 0.01);
    if (i >= 0) {
      resultado[restantes[i].contrato] += v;
      restantes.splice(i, 1);
    } else sobras.push(v);
  }
  for (const v of sobras) {
    if (restantes.length === 0) break;
    const i = Math.max(
      0,
      restantes.findIndex((c) => c.valorParcela > v),
    );
    resultado[restantes[i].contrato] += v;
    restantes.splice(i, 1);
  }
  // Diferença de recibo de férias (15577/15576 sem fechar): completa os contratos ainda em aberto.
  let diferenca = arred(totalDescontado - Object.values(resultado).reduce((a, v) => a + v, 0));
  for (const c of [...contratos].reverse()) {
    if (Math.abs(diferenca) <= 0.01) break;
    const ajuste = diferenca > 0 ? Math.min(diferenca, c.valorParcela - resultado[c.contrato]) : Math.max(diferenca, -resultado[c.contrato]);
    resultado[c.contrato] = arred(resultado[c.contrato] + ajuste);
    diferenca = arred(diferenca - ajuste);
  }
  return resultado;
}

export function compararConsignado(
  contratos: ContratoConsignado[],
  folha: FuncionarioFolha[],
  matriculaPorCpf: Map<string, string>,
  competencia: string,
) {
  const p = parametrosDoAno(Number(competencia.split("/")[1])).parametros;
  const porMatricula = new Map(folha.map((f) => [f.matricula, f]));
  const porCpf = new Map<string, ContratoConsignado[]>();
  for (const c of contratos) porCpf.set(c.cpf, [...(porCpf.get(c.cpf) ?? []), c]);

  const linhas: LinhaConsignado[] = [];
  const matriculasNoArquivo = new Set<string>();

  for (const [cpf, cs] of porCpf) {
    const previsto = arred(cs.reduce((a, c) => a + c.valorParcela, 0));
    const matricula = matriculaPorCpf.get(cpf) ?? null;
    const f = matricula ? porMatricula.get(matricula) : undefined;
    const base = { cpf, matricula, contratos: cs, previsto, descontoPorContrato: Object.fromEntries(cs.map((c) => [c.contrato, 0])) };
    if (!matricula) {
      linhas.push({
        ...base,
        nome: cs[0].nome,
        funcao: "",
        situacaoFolha: "",
        descontado: 0,
        naoDescontado: previsto,
        limite: null,
        remuneracaoBruta: 0,
        inss: 0,
        ir: 0,
        pensao: 0,
        situacao: "sem_cadastro",
        detalhe: "CPF do arquivo não encontrado no cadastro de funcionários desta empresa.",
      });
      continue;
    }
    matriculasNoArquivo.add(matricula);
    if (!f) {
      linhas.push({
        ...base,
        nome: cs[0].nome,
        funcao: "",
        situacaoFolha: "",
        descontado: 0,
        naoDescontado: previsto,
        limite: null,
        remuneracaoBruta: 0,
        inss: 0,
        ir: 0,
        pensao: 0,
        situacao: "fora_da_folha",
        detalhe: `Matrícula ${matricula} não está na folha de ${competencia}.`,
      });
      continue;
    }

    const val = (codigo: string) => f.eventos.filter((e) => e.codigo === codigo).reduce((a, e) => a + e.valor, 0);
    // Portaria MTE 435/2025, art. 30 §2º: remuneração disponível = vencimentos com incidência de INSS
    // (bases 00096 salário + 00981 férias + 00094 13º) − INSS − IRRF − descontos obrigatórios (pensão).
    const bruto = arred(val("00096") + val("00981") + val("00094"));
    const inss = arred(val("00451") + val("00500") + val("00452"));
    const ir = arred(val("00453") + val("00481"));
    const pensao = arred(val("00469") + val("00470") + val("00551"));
    const limite = arred(Math.max(0, (bruto - inss - ir - pensao) * p.limiteConsignado));
    const descontado = arred(descontoConsignado(f.eventos));
    const naoDescontado = arred(previsto - descontado);
    const descontoPorContrato = distribuirDescontoPorContrato(cs, f.eventos, descontado);
    const desligado = /^Desligado/i.test(f.situacao);
    const textoLimite = `Limite de 35% de (vencimentos c/ INSS ${fmt(bruto)} − INSS ${fmt(inss)} − IR ${fmt(ir)}${pensao ? ` − pensão ${fmt(pensao)}` : ""}) = ${fmt(limite)}.`;

    let situacao: SituacaoConsignado;
    let detalhe: string;
    if (Math.abs(naoDescontado) <= TOLERANCIA) {
      situacao = "ok";
      detalhe = `Parcelas descontadas integralmente. ${textoLimite}`;
    } else if (naoDescontado < 0) {
      situacao = "descontado_a_mais";
      detalhe = `A folha descontou ${fmt(-naoDescontado)} a mais do que as parcelas do arquivo (${fmt(previsto)}).`;
    } else if (desligado) {
      // Na rescisão só desconta se o contrato tiver garantia das verbas rescisórias (consultar no
      // portal); com garantia o desconto pode passar dos 35%, até o saldo devedor.
      situacao = "rescisao_sem_desconto";
      detalhe = `${f.situacao}: a rescisão descontou ${fmt(descontado)} de ${fmt(previsto)}. Consultar no portal do e-Consignado se o contrato tem garantia das verbas rescisórias — sem garantia, não se desconta; com garantia, o desconto pode passar dos 35%, até o saldo devedor.`;
    } else if (bruto <= TOLERANCIA || limite <= TOLERANCIA) {
      situacao = "sem_remuneracao";
      detalhe = `Sem remuneração no mês${/^Afastado/i.test(f.situacao) ? ` (${f.situacao})` : ""} — não havia o que descontar; o colaborador precisa acertar ${fmt(naoDescontado)} com o(s) banco(s).`;
    } else if (descontado >= limite - 1) {
      situacao = "parcial_limite";
      detalhe = `Descontado até o limite: ${fmt(naoDescontado)} ficou sem desconto. ${textoLimite}`;
    } else {
      situacao = "nao_descontado";
      detalhe = `Havia margem (${fmt(limite)}) e só foi descontado ${fmt(descontado)} de ${fmt(previsto)}. ${textoLimite}`;
    }
    linhas.push({
      ...base,
      nome: f.nome,
      funcao: f.funcao,
      situacaoFolha: f.situacao,
      descontoPorContrato,
      descontado,
      naoDescontado: Math.max(0, naoDescontado),
      limite,
      remuneracaoBruta: bruto,
      inss,
      ir,
      pensao,
      situacao,
      detalhe,
    });
  }

  // Desconto de consignado na folha de quem não tem contrato no arquivo.
  for (const f of folha) {
    if (matriculasNoArquivo.has(f.matricula)) continue;
    const descontado = arred(descontoConsignado(f.eventos));
    if (descontado <= TOLERANCIA) continue;
    linhas.push({
      cpf: "",
      matricula: f.matricula,
      nome: f.nome,
      funcao: f.funcao,
      situacaoFolha: f.situacao,
      contratos: [],
      descontoPorContrato: {},
      previsto: 0,
      descontado,
      naoDescontado: 0,
      limite: null,
      remuneracaoBruta: 0,
      inss: 0,
      ir: 0,
      pensao: 0,
      situacao: "desconto_sem_contrato",
      detalhe: `A folha descontou ${fmt(descontado)} de e-consignado, mas o colaborador não tem contrato no arquivo desta competência.`,
    });
  }

  const ordem: Record<string, number> = { erro: 0, alerta: 1, pendente: 2, ok: 3 };
  linhas.sort((a, b) => ordem[STATUS_SITUACAO[a.situacao]] - ordem[STATUS_SITUACAO[b.situacao]] || a.nome.localeCompare(b.nome));
  return linhas;
}
