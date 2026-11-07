// Conferência das verbas da rescisão pelo motivo de desligamento do Praxio (tabela enviada pelo DP).
// A folha traz "Desligado em DD/MM/AAAA motivo NN" na situação do colaborador.

import type { FuncionarioFolha } from "../parsers/folha-pagamento";
import type { Critica, ResultadoFuncionario } from "./conferencia";

type Grupo = "sem_justa_causa" | "acordo_ccp" | "prazo" | "justa_causa" | "pedido" | "falecimento" | "antecipacao_empregado" | "antecipacao_empregador";

export const MOTIVOS_DESLIGAMENTO: Record<string, { descricao: string; grupo: Grupo; multaAcordo?: number }> = {
  "11": { descricao: "sem justa causa pelo empregador", grupo: "sem_justa_causa" },
  "22": { descricao: "acordo (multa de 20%) pago por ata/CCP", grupo: "acordo_ccp", multaAcordo: 20 },
  "92": { descricao: "acordo (multa de 40%) pago por ata/CCP", grupo: "acordo_ccp", multaAcordo: 40 },
  "12": { descricao: "extinção do contrato por prazo", grupo: "prazo" },
  "10": { descricao: "justa causa pelo empregador", grupo: "justa_causa" },
  "20": { descricao: "justa causa pelo empregador", grupo: "justa_causa" },
  "21": { descricao: "pedido de demissão", grupo: "pedido" },
  "60": { descricao: "falecimento", grupo: "falecimento" },
  "93": { descricao: "antecipação do contrato de experiência pelo empregado (art. 480)", grupo: "antecipacao_empregado" },
  "13": { descricao: "antecipação do contrato de experiência pelo empregador (art. 479)", grupo: "antecipacao_empregador" },
};

// Afastamentos por matrícula (aba de afastamentos + situação "Afastado em" das folhas importadas).
export type AfastamentosPorMatricula = Map<string, { inicio: string; fim: string | null }[]>; // "AAAA-MM-DD"

const TOLERANCIA = 0.05;
const DIA = 86_400_000;
const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d));
const deBr = (s: string) => {
  const [d, m, a] = s.split("/").map(Number);
  return utc(a, m - 1, d);
};
const deIso = (s: string) => {
  const [a, m, d] = s.slice(0, 10).split("-").map(Number);
  return utc(a, m - 1, d);
};
const br = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
function somarMeses(d: Date, k: number) {
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + k;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return utc(ano, mes, Math.min(d.getUTCDate(), ultimo));
}

function piorStatus(criticas: Critica[]): ResultadoFuncionario["status"] {
  const ordem: Record<string, number> = { erro: 3, alerta: 2, pendente: 1, ok: 0 };
  return criticas.reduce<ResultadoFuncionario["status"]>(
    (pior, c) => (c.status !== "info" && ordem[c.status] > ordem[pior] ? c.status : pior),
    "ok",
  );
}

// Anos completos para o aviso proporcional (Lei 12.506): o ano (de aniversário a aniversário da
// admissão) em que houve afastamento não conta como ano completo (regra do Praxio, confirmada pelo DP).
function anosParaAviso(admissao: Date, desligamento: Date, afastamentos: { inicio: Date; fim: Date }[]) {
  const anos: { inicio: Date; fim: Date; conta: boolean }[] = [];
  for (let k = 0; ; k++) {
    const inicio = somarMeses(admissao, 12 * k);
    const fim = new Date(somarMeses(admissao, 12 * (k + 1)).getTime() - DIA);
    if (fim > desligamento) break;
    const comAfastamento = afastamentos.some((a) => a.inicio <= fim && a.fim >= inicio);
    anos.push({ inicio, fim, conta: !comAfastamento });
  }
  return anos;
}

export function conferirMotivoDesligamento(
  f: FuncionarioFolha,
  resultado: ResultadoFuncionario,
  afastamentos: AfastamentosPorMatricula | undefined,
): ResultadoFuncionario {
  const m = f.situacao.match(/Desligado em (\d{2}\/\d{2}\/\d{4})\s+motivo\s+(\d+)/i);
  if (!m) return resultado;
  const desl = deBr(m[1]);
  const codigo = m[2];
  const motivo = MOTIVOS_DESLIGAMENTO[codigo];
  const ev = (c: string) => f.eventos.find((e) => e.codigo === c);
  const val = (c: string) => f.eventos.filter((e) => e.codigo === c).reduce((a, e) => a + e.valor, 0);
  const tem = (c: string) => f.eventos.some((e) => e.codigo === c);
  // Salário do mês da rescisão (00569 SALARIO MENSAL) quando vier; senão, o do cadastro da folha.
  const salarioDia = (val("00569") || f.salarioBase) / 30;
  const criticas: Critica[] = [];
  const push = (status: Critica["status"], titulo: string, detalhe: string, esperado?: number, encontrado?: number) =>
    criticas.push({ regra: "rescisao", titulo, status, detalhe, esperado, encontrado });

  if (!motivo) {
    push("pendente", "Motivo do desligamento", `Motivo ${codigo} não está entre os conferidos pelo sistema — conferir as verbas no Praxio.`);
  } else {
    const titulo = `Verbas do motivo ${codigo}`;
    const temProventos = f.eventos.some((e) => e.coluna === "provento");

    if (motivo.grupo === "acordo_ccp") {
      push(
        temProventos ? "alerta" : "ok",
        titulo,
        temProventos
          ? `Motivo ${codigo} — ${motivo.descricao}: a rescisão deveria vir zerada no sistema, mas tem verbas na folha.`
          : `Motivo ${codigo} — ${motivo.descricao}: rescisão zerada no sistema, como combinado; as verbas são conferidas na ata.`,
      );
    } else {
      // Verbas que não podem aparecer neste motivo (erro) e que deveriam aparecer (alerta).
      const proibidas: [string[], string][] = [];
      const avisoIndenizado = ["00211", "00349"];
      const projecao = ["00166", "00212"];
      if (motivo.grupo !== "sem_justa_causa") {
        proibidas.push([["00916"], "multa de 40% do FGTS"], [avisoIndenizado, "aviso prévio indenizado"], [projecao, "projeção do aviso (1/12 de férias e 13º)"]);
      }
      if (motivo.grupo === "justa_causa") proibidas.push([["00014"], "férias proporcionais"], [["00024"], "13º proporcional"]);
      if (motivo.grupo !== "antecipacao_empregado") proibidas.push([["00497"], "desconto do art. 480"]);
      if (motivo.grupo !== "pedido") proibidas.push([["00700"], "desconto do aviso prévio"]);
      const encontradas = proibidas.filter(([cods]) => cods.some(tem)).map(([, nome]) => nome);
      const faltando = motivo.grupo === "sem_justa_causa" && !tem("00916") ? ["multa de 40% do FGTS"] : [];
      if (encontradas.length) {
        push("erro", titulo, `Motivo ${codigo} — ${motivo.descricao}: não deveria ter ${encontradas.join(", ")}.`);
      } else if (faltando.length) {
        push("alerta", titulo, `Motivo ${codigo} — ${motivo.descricao}: faltou ${faltando.join(", ")}.`);
      } else {
        push("ok", titulo, `Motivo ${codigo} — ${motivo.descricao}: as verbas lançadas são as esperadas para o motivo.`);
      }

      // Art. 480: metade dos dias que faltavam para o fim da experiência (1º prazo de 30 dias,
      // prorrogação até 90) × salário ÷ 30.
      if (motivo.grupo === "antecipacao_empregado" && f.admissao) {
        const adm = deBr(f.admissao);
        const fim30 = new Date(adm.getTime() + 29 * DIA);
        const fim90 = new Date(adm.getTime() + 89 * DIA);
        const fimContrato = desl <= fim30 ? fim30 : fim90;
        const diasRestantes = Math.max(0, Math.round((fimContrato.getTime() - desl.getTime()) / DIA));
        const dias = diasRestantes / 2;
        const esperado = dias * salarioDia;
        const encontrado = val("00497");
        if (!tem("00497")) {
          push("alerta", "Desconto do art. 480", `Faltavam ${diasRestantes} dias para o fim da experiência (${br(fimContrato)}) e não houve o desconto de metade (${fmt(dias)} dias = ${fmt(esperado)}).`, arred(esperado), 0);
        } else {
          push(
            Math.abs(esperado - encontrado) <= TOLERANCIA ? "ok" : "alerta",
            "Desconto do art. 480",
            `Experiência até ${br(fimContrato)} (${desl <= fim30 ? "1º prazo de 30 dias" : "prorrogação até 90 dias"}): faltavam ${diasRestantes} dias → metade = ${fmt(dias)} dias × salário ÷ 30 = ${fmt(esperado)}.` +
              (Math.abs(esperado - encontrado) <= TOLERANCIA ? "" : ` Diferença de ${fmt(encontrado - esperado)} — conferir o prazo do contrato de experiência.`),
            arred(esperado),
            arred(encontrado),
          );
        }
      }

      // Pedido de demissão: desconto do aviso não cumprido = (30 − dias trabalhados do aviso) × salário ÷ 30.
      if (motivo.grupo === "pedido") {
        // 00919: dias de aviso cumpridos (o número vem no valor do evento).
        const e919 = ev("00919");
        const trabalhados = e919 ? (e919.referencia ?? e919.valor) : 0;
        const diasDesconto = Math.max(0, 30 - trabalhados);
        const esperado = diasDesconto * salarioDia;
        const encontrado = val("00700");
        if (!tem("00700")) {
          if (diasDesconto > 0)
            push("alerta", "Desconto do aviso prévio", `Sem desconto do aviso prévio${trabalhados ? ` (${fmt(trabalhados)} dias cumpridos)` : ""} — confirmar se a diretoria autorizou não descontar.`);
        } else {
          push(
            Math.abs(esperado - encontrado) <= TOLERANCIA ? "ok" : "alerta",
            "Desconto do aviso prévio",
            `${trabalhados ? `${fmt(trabalhados)} dia(s) de aviso cumpridos → ` : "Aviso não cumprido → "}${fmt(diasDesconto)} dias × salário ÷ 30 = ${fmt(esperado)}.` +
              (Math.abs(esperado - encontrado) <= TOLERANCIA ? "" : ` Diferença de ${fmt(encontrado - esperado)}.`),
            arred(esperado),
            arred(encontrado),
          );
        }
      }

      // Sem justa causa: aviso proporcional de 3 dias por ano completo (Lei 12.506), sem contar o ano
      // com afastamento. Com 00211 (30 dias) e 00349 (proporcional) a razão entre os dois dá os dias
      // exatos (mesma base, com médias); só com 00349 a conta é aproximada (inclui médias).
      if (motivo.grupo === "sem_justa_causa" && f.admissao && (tem("00211") || tem("00349"))) {
        const adm = deBr(f.admissao);
        const afast = (afastamentos?.get(f.matricula) ?? []).map((a) => ({ inicio: deIso(a.inicio), fim: a.fim ? deIso(a.fim) : desl }));
        const anos = anosParaAviso(adm, desl, afast);
        const contam = anos.filter((a) => a.conta).length;
        const semContar = anos.filter((a) => !a.conta);
        const esperado = Math.min(60, 3 * contam);
        const textoAnos =
          `${anos.length} ano(s) completo(s) desde ${br(adm)}` +
          (semContar.length ? `, ${semContar.length} com afastamento não conta(m) (${semContar.map((a) => `${br(a.inicio)} a ${br(a.fim)}`).join("; ")})` : "") +
          ` → ${contam} × 3 = ${esperado} dias de aviso proporcional`;
        let pagos: number | null = null;
        let aproximado = false;
        if (tem("00211") && tem("00349")) pagos = Math.round((val("00349") / val("00211")) * 30 * 10) / 10;
        else if (tem("00349")) {
          pagos = val("00349") / salarioDia;
          aproximado = true;
        } else pagos = 0;
        // Só com o 00349 o valor inclui médias: confere apenas que não veio abaixo do devido.
        const confere = aproximado ? pagos >= esperado - 0.5 : Math.abs(pagos - esperado) < 0.15;
        if (confere) {
          push("ok", "Aviso prévio proporcional", `${textoAnos}.${aproximado ? ` Pago ≈ ${fmt(pagos)} dias (inclui médias).` : ""}`, esperado, arred(pagos));
        } else if (pagos < esperado) {
          push(
            "ok",
            "Aviso prévio proporcional",
            `${textoAnos}; o ERP pagou ${aproximado ? "≈ " : ""}${fmt(pagos)} dias. A diferença deve ser de afastamento anterior às folhas importadas (o ano com afastamento não conta) — informação retroativa, desconsiderada pelo DP.`,
            esperado,
            arred(pagos),
          );
        } else {
          push("alerta", "Aviso prévio proporcional", `${textoAnos}; o ERP pagou ${aproximado ? "≈ " : ""}${fmt(pagos)} dias — mais do que o devido.`, esperado, arred(pagos));
        }
      }
    }
  }

  // Substitui a pendência genérica que aguardava a tabela de motivos.
  const mantidas = resultado.criticas
    .filter((c) => !(c.regra === "rescisao" && c.titulo === "Verbas da rescisão"))
    .map((c) =>
      c.regra === "banco_horas" && c.status === "pendente" && motivo?.grupo === "acordo_ccp" && /sem verbas/.test(c.detalhe)
        ? { ...c, status: "ok" as const, detalhe: `${c.detalhe.replace(/ — será conferido.*$/, "")} — acordo pago por ata (motivo ${codigo}); conferir as horas na ata.` }
        : c,
    );
  const todas = [...mantidas, ...criticas];
  return { ...resultado, criticas: todas, status: piorStatus(todas) };
}
