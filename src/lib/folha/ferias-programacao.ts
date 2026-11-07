// Conferência de férias com a Programação de Férias importada no app (período aquisitivo, faltas e
// dias de direito). A programação é uma "foto" dos períodos em aberto no dia da importação: o
// período já gozado sai dela. Por isso serve para a rescisão (período vencido e período em
// andamento) e, no mês de gozo, só quando o período ainda está na programação.

import type { FuncionarioFolha } from "../parsers/folha-pagamento";
import type { Critica, ResultadoFuncionario } from "./conferencia";

export type PeriodoFeriasProgramacao = {
  inicio: string; // "AAAA-MM-DD"
  fim: string;
  faltas: number;
  diasDireito: number;
  gozoInicio: string | null;
  gozoFim: string | null;
  diasAbono: number;
};

// Por matrícula (6 dígitos). null = a empresa não tem programação de férias importada.
export type ProgramacaoFerias = Map<string, PeriodoFeriasProgramacao[]>;

const TOLERANCIA = 0.05;
const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d));
const deIso = (s: string) => {
  const [a, m, d] = s.slice(0, 10).split("-").map(Number);
  return utc(a, m - 1, d);
};
const deBr = (s: string) => {
  const [d, m, a] = s.split("/").map(Number);
  return utc(a, m - 1, d);
};
const br = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
const DIA = 86_400_000;

// Mesma data k meses depois; dia que não existe no mês cai no último dia (31/01 + 1 → 28/02).
function somarMeses(d: Date, k: number) {
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + k;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return utc(ano, mes, Math.min(d.getUTCDate(), ultimo));
}

// Avos de férias de `inicio` até `fim` (inclusive): 1/12 por mês completo + 1/12 pela fração de
// 15 dias ou mais (CLT art. 146, parágrafo único).
export function avosFerias(inicio: Date, fim: Date) {
  let meses = 0;
  while (meses < 12 && somarMeses(inicio, meses + 1).getTime() - DIA <= fim.getTime()) meses++;
  if (meses >= 12) return 12;
  const resto = Math.round((fim.getTime() - somarMeses(inicio, meses).getTime()) / DIA) + 1;
  return meses + (resto >= 15 ? 1 : 0);
}

// Início do período aquisitivo em andamento na data, pelo aniversário da admissão.
function inicioPeriodoPelaAdmissao(admissao: Date, data: Date) {
  let anos = data.getUTCFullYear() - admissao.getUTCFullYear();
  let inicio = somarMeses(admissao, anos * 12);
  if (inicio > data) inicio = somarMeses(admissao, --anos * 12);
  return inicio;
}

function piorStatus(criticas: Critica[]): ResultadoFuncionario["status"] {
  const ordem: Record<string, number> = { erro: 3, alerta: 2, pendente: 1, ok: 0 };
  return criticas.reduce<ResultadoFuncionario["status"]>(
    (pior, c) => (c.status !== "info" && ordem[c.status] > ordem[pior] ? c.status : pior),
    "ok",
  );
}

// Histórico das folhas mensais da empresa, para as médias de férias.
export type HistoricoFolhas = {
  competencias: Set<string>; // "AAAA-MM" importadas
  // matrícula → competência "AAAA-MM" → salário do mês e soma das variáveis (HE, noturno e DSRs)
  porMatricula: Map<string, Map<string, { salario: number; variaveis: number }>>;
};

// Variáveis que entram na média de férias (validado com o Praxio em rescisões de 2026).
export const CODIGOS_MEDIA_FERIAS = ["00003", "00363", "00659", "00004", "00126", "00119"];

type Media = { mediaMensal: number; parcela: number; texto: string } | { faltando: string[] };

const chaveMes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const mesBr = (chave: string) => `${chave.slice(5)}/${chave.slice(0, 4)}`;

function faixaMeses(faltando: string[]) {
  if (faltando.length === 0) return "";
  return faltando.length === 1 ? mesBr(faltando[0]) : `${mesBr(faltando[0])} a ${mesBr(faltando[faltando.length - 1])}`;
}

// Média do período aquisitivo: soma das variáveis dos meses de `inicio` até `ultimoMes`
// (inclusive), cada mês corrigido pelo salário atual (reajuste), ÷ `divisor` (avos do período).
function mediaDoPeriodo(
  historico: HistoricoFolhas,
  matricula: string,
  inicio: Date,
  ultimoMes: Date,
  divisor: number,
  salarioAtual: number,
): { mediaMensal: number; meses: number } | { faltando: string[] } {
  const meses: string[] = [];
  for (let d = utc(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1); d <= ultimoMes; d = utc(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    meses.push(chaveMes(d));
  const faltando = meses.filter((m) => !historico.competencias.has(m));
  if (faltando.length) return { faltando };
  const doFuncionario = historico.porMatricula.get(matricula);
  let soma = 0;
  for (const m of meses) {
    const mes = doFuncionario?.get(m);
    if (mes && mes.variaveis) soma += mes.variaveis * (mes.salario > 0 ? salarioAtual / mes.salario : 1);
  }
  return { mediaMensal: divisor > 0 ? soma / divisor : 0, meses: meses.length };
}

// Compara o valor pago com o calculado. Com a média do período calculada: igual = ok, diferente =
// alerta. Sem a média (faltam folhas): igual ao valor sem médias = ok; acima = pendente (deve ser a
// média); abaixo = alerta (dias a menos).
function compararComMinimo(
  regra: string,
  titulo: string,
  pago: number,
  semMedias: number,
  comAdicional: number,
  explicar: (comAdicional: boolean) => string,
  abaixo: string,
  media: Media | null,
): Critica {
  if (media && "parcela" in media) {
    const usaAdicional = Math.abs(comAdicional + media.parcela - pago) < Math.abs(semMedias + media.parcela - pago);
    const esperado = (usaAdicional ? comAdicional : semMedias) + media.parcela;
    const tolerancia = Math.max(TOLERANCIA, media.parcela * 0.01 + 0.05);
    const base = { regra, titulo, esperado: arred(esperado), encontrado: arred(pago) };
    const texto = `${explicar(usaAdicional)} + médias ${fmt(media.parcela)} (${media.texto})`;
    if (Math.abs(pago - esperado) <= tolerancia) return { ...base, status: "ok", detalhe: `${texto} = ${fmt(esperado)}.` };
    return {
      ...base,
      status: "alerta",
      detalhe: `${texto} = ${fmt(esperado)}. Diferença de ${fmt(pago - esperado)}${pago < esperado ? ` — ${abaixo}` : " — conferir as médias no Praxio."}`,
    };
  }
  const base = { regra, titulo, esperado: arred(comAdicional), encontrado: arred(pago) };
  if (Math.abs(pago - semMedias) <= TOLERANCIA && Math.abs(pago - comAdicional) > TOLERANCIA) {
    return { ...base, esperado: arred(semMedias), status: "ok", detalhe: `${explicar(false)}.` };
  }
  if (Math.abs(pago - comAdicional) <= TOLERANCIA) return { ...base, status: "ok", detalhe: `${explicar(true)}.` };
  const explicacao = explicar(true);
  if (pago > semMedias) {
    const faltam = media && "faltando" in media ? ` faltam as folhas de ${faixaMeses(media.faltando)} no sistema para calcular a média do período aquisitivo` : " a média do período será conferida com o histórico das folhas";
    return {
      ...base,
      status: "pendente",
      detalhe: `${explicacao}. Pago ${fmt(pago - Math.min(semMedias, comAdicional))} a mais — deve ser a média de horas extras/adicionais do período;${faltam}.`,
    };
  }
  return { ...base, status: "alerta", detalhe: `${explicacao}. ${abaixo}` };
}

export function conferirFeriasProgramacao(
  f: FuncionarioFolha,
  resultado: ResultadoFuncionario,
  programacao: ProgramacaoFerias | null,
  historico?: HistoricoFolhas,
): ResultadoFuncionario {
  const val = (codigo: string) => f.eventos.filter((e) => e.codigo === codigo).reduce((a, e) => a + e.valor, 0);
  const tem = (codigo: string) => f.eventos.some((e) => e.codigo === codigo);
  const periodos = programacao?.get(f.matricula) ?? [];
  const semProgramacao = programacao === null;
  const criticas: Critica[] = [];

  const adicional = tem("01000") ? val("01000") : val("00005") + val("00006");
  const textoSalario = `${fmt(f.salarioBase)}${adicional ? ` + adicional ${fmt(adicional)}` : ""}`;
  const descPeriodo = (p: PeriodoFeriasProgramacao) =>
    `período ${br(deIso(p.inicio))} a ${br(deIso(p.fim))}, ${p.faltas} falta(s) = ${p.diasDireito} dias de direito`;

  // --- Rescisão ------------------------------------------------------------------------------
  const desligamento = f.situacao.match(/Desligado em (\d{2}\/\d{2}\/\d{4})/i)?.[1];
  if (desligamento && (tem("00009") || tem("00014"))) {
    const desl = deBr(desligamento);

    // Férias vencidas: períodos completos até o desligamento e ainda não gozados.
    if (tem("00009")) {
      const vencidos = periodos.filter((p) => deIso(p.fim) <= desl && !(p.gozoFim && deIso(p.gozoFim) < desl));
      if (vencidos.length === 0) {
        criticas.push({
          regra: "rescisao",
          titulo: "Férias vencidas indenizadas",
          status: "pendente",
          encontrado: arred(val("00009")),
          detalhe: semProgramacao
            ? "Importe a Programação de Férias desta empresa para conferir os dias de direito do período vencido."
            : "A Programação de Férias não tem período vencido em aberto para esta matrícula na data do desligamento — confirmar no Praxio.",
        });
      } else {
        const dias = vencidos.reduce((a, p) => a + p.diasDireito, 0);
        const pago = val("00009");
        const semMedias = (f.salarioBase / 30) * dias;
        const comAdicional = ((f.salarioBase + adicional) / 30) * dias;
        const diasPagos = pago / (f.salarioBase / 30);
        // Média do(s) período(s) vencido(s): 12 avos cada, do mês de início ao mês do fim.
        let media: Media | null = null;
        if (historico) {
          const r = mediaDoPeriodo(historico, f.matricula, deIso(vencidos[0].inicio), deIso(vencidos[vencidos.length - 1].fim), 12 * vencidos.length, f.salarioBase);
          media = "faltando" in r ? r : { mediaMensal: r.mediaMensal, parcela: (r.mediaMensal / 30) * dias, texto: `média mensal ${fmt(r.mediaMensal)} ÷ 30 × ${dias} dias` };
        }
        criticas.push(
          compararComMinimo(
            "rescisao",
            "Férias vencidas indenizadas",
            pago,
            semMedias,
            comAdicional,
            (comAd) =>
              `${vencidos.map(descPeriodo).join("; ")} → (${comAd ? textoSalario : fmt(f.salarioBase)}) ÷ 30 × ${dias} dias = ${fmt(comAd ? comAdicional : semMedias)}`,
            `O valor pago equivale a cerca de ${fmt(diasPagos)} dias de salário, mas a Programação de Férias indica ${dias} dias de direito — conferir as faltas do período no Praxio.`,
            media,
          ),
        );
        if (vencidos.length > 1) {
          criticas.push({
            regra: "rescisao",
            titulo: "Mais de um período vencido",
            status: "alerta",
            detalhe: `${vencidos.length} períodos vencidos sem gozo — verificar se algum passou do prazo legal (férias em dobro).`,
          });
        }
      }
    }

    // Férias proporcionais: avos do período em andamento até o desligamento (sem a projeção do
    // aviso prévio, que vem no evento 00166 e depende do motivo do desligamento).
    if (tem("00014")) {
      const vencidoMaisRecente = periodos
        .filter((p) => deIso(p.fim) <= desl)
        .sort((a, b) => b.fim.localeCompare(a.fim))[0];
      const atual = periodos.find((p) => deIso(p.inicio) <= desl && desl < deIso(p.fim));
      const inicio = atual
        ? deIso(atual.inicio)
        : vencidoMaisRecente
          ? new Date(deIso(vencidoMaisRecente.fim).getTime() + DIA)
          : f.admissao
            ? inicioPeriodoPelaAdmissao(deBr(f.admissao), desl)
            : null;
      if (inicio) {
        const avos = avosFerias(inicio, desl);
        const diasDireito = atual?.diasDireito ?? 30;
        const fator = diasDireito / 30;
        const pago = val("00014");
        const semMedias = (f.salarioBase / 12) * avos * fator;
        const comAdicional = ((f.salarioBase + adicional) / 12) * avos * fator;
        // Média do período em andamento: meses do início até o mês anterior ao desligamento ÷ avos.
        let media: Media | null = null;
        if (historico) {
          const ultimoMes = utc(desl.getUTCFullYear(), desl.getUTCMonth() - 1, 1);
          const r =
            ultimoMes < utc(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1)
              ? { mediaMensal: 0, meses: 0 }
              : mediaDoPeriodo(historico, f.matricula, inicio, ultimoMes, avos, f.salarioBase);
          media =
            "faltando" in r
              ? r
              : {
                  mediaMensal: r.mediaMensal,
                  parcela: (r.mediaMensal / 12) * avos * fator,
                  texto: `HE, noturno e DSRs de ${r.meses} mês(es) do período, corrigidos pelo salário atual, ÷ ${avos} avos = ${fmt(r.mediaMensal)}/mês ÷ 12 × ${avos}${diasDireito < 30 ? ` × ${diasDireito}/30` : ""}`,
                };
        }
        const origem = atual
          ? `${descPeriodo(atual)}`
          : `período iniciado em ${br(inicio)} (pela ${vencidoMaisRecente ? "programação" : "data de admissão"})`;
        criticas.push(
          compararComMinimo(
            "rescisao",
            "Férias proporcionais",
            pago,
            semMedias,
            comAdicional,
            (comAd) =>
              `${origem}; ${avos} avo(s) de ${br(inicio)} a ${br(desl)} → (${comAd ? textoSalario : fmt(f.salarioBase)}) ÷ 12 × ${avos}${diasDireito < 30 ? ` × ${diasDireito}/30` : ""} = ${fmt(comAd ? comAdicional : semMedias)}`,
            `O valor pago está abaixo de ${avos} avo(s) — conferir os avos e as faltas no Praxio.`,
            media,
          ),
        );
        // Sem o período na programação as faltas não são conhecidas: valor abaixo pode ser a redução
        // dos dias pelas faltas (CLT art. 130) — fica pendente, não alerta.
        const ultima = criticas[criticas.length - 1];
        if (!atual && ultima.status === "alerta" && (ultima.encontrado ?? 0) < (ultima.esperado ?? 0)) {
          ultima.status = "pendente";
          ultima.detalhe =
            ultima.detalhe.replace(/ (O valor pago está abaixo|Diferença de).*$/, "") +
            ` Valor abaixo de ${avos} avo(s) — deve ser a redução pelas faltas do período (6 a 14 faltas = 24 dias, 15 a 23 = 18, 24 a 32 = 12), que não estão na Programação de Férias${semProgramacao ? " (importe a programação desta empresa)" : " (o desligado não estava nela)"}; conferir no Praxio.`;
        }
      }
    }
  }

  // --- Mês de gozo: dias de gozo + abono não podem passar dos dias de direito ---------------------
  if (tem("00007") && f.gozoInicio && f.gozoFim) {
    const [d, m, a] = f.gozoInicio.split("/");
    const periodo = periodos.find((p) => p.gozoInicio?.slice(0, 10) === `${a}-${m}-${d}`);
    if (periodo) {
      const diasGozo = Math.round((deBr(f.gozoFim).getTime() - deBr(f.gozoInicio).getTime()) / DIA) + 1;
      const total = diasGozo + periodo.diasAbono;
      criticas.push({
        regra: "ferias",
        titulo: "Dias de férias x direito",
        status: total > periodo.diasDireito ? "alerta" : "ok",
        esperado: periodo.diasDireito,
        encontrado: total,
        detalhe:
          `${descPeriodo(periodo)}; gozo de ${diasGozo} dia(s)${periodo.diasAbono ? ` + ${periodo.diasAbono} de abono` : ""} = ${total}.` +
          (total > periodo.diasDireito ? ` Passa ${total - periodo.diasDireito} dia(s) do direito — conferir as faltas do período.` : ""),
      });
    }
  }

  // --- Mês de gozo: médias do período aquisitivo (00084), quando o período está na programação ---
  let substituiMedias = false;
  if (tem("00084") && f.gozoInicio && f.gozoFim && historico) {
    const [d, m, a] = f.gozoInicio.split("/");
    const periodo = periodos.find((p) => p.gozoInicio?.slice(0, 10) === `${a}-${m}-${d}`);
    if (periodo) {
      const fim = deIso(periodo.fim);
      const r = mediaDoPeriodo(historico, f.matricula, deIso(periodo.inicio), fim < deBr(f.gozoInicio) ? fim : deBr(f.gozoInicio), 12, f.salarioBase);
      substituiMedias = true;
      if ("faltando" in r) {
        criticas.push({
          regra: "ferias_medias",
          titulo: "Médias de férias",
          status: "pendente",
          encontrado: arred(val("00084")),
          detalhe: `Médias do ${descPeriodo(periodo)}: soma de HE, noturno e DSRs do período, corrigida pelo salário atual, ÷ 12. Faltam as folhas de ${faixaMeses(r.faltando)} no sistema.`,
        });
      } else {
        const inicioMes = utc(Number(a), Number(m) - 1, 1);
        const gozoIni = deBr(f.gozoInicio);
        const gozoFim = deBr(f.gozoFim);
        const fimMes = utc(inicioMes.getUTCFullYear(), inicioMes.getUTCMonth() + 1, 0);
        const diasMes = Math.round((Math.min(gozoFim.getTime(), fimMes.getTime()) - Math.max(gozoIni.getTime(), inicioMes.getTime())) / DIA) + 1;
        const esperado = (r.mediaMensal / 30) * diasMes;
        const ok = Math.abs(esperado - val("00084")) <= Math.max(TOLERANCIA, esperado * 0.01 + 0.05);
        criticas.push({
          regra: "ferias_medias",
          titulo: "Médias de férias",
          status: ok ? "ok" : "pendente",
          esperado: arred(esperado),
          encontrado: arred(val("00084")),
          detalhe:
            `Média do período = ${fmt(r.mediaMensal)}/mês (HE, noturno e DSRs de ${r.meses} mês(es), corrigidos pelo salário atual, ÷ 12) ÷ 30 × ${diasMes} dia(s) de gozo = ${fmt(esperado)}.` +
            (ok ? "" : " Não bateu — conferir no recibo de férias."),
        });
      }
    }
  }

  if (criticas.length === 0) return resultado;
  // Substitui as pendências genéricas que dependiam da programação/histórico.
  const mantidas = resultado.criticas.filter(
    (c) => !(c.regra === "rescisao" && c.titulo === "Férias indenizadas") && !(substituiMedias && c.regra === "ferias_medias" && c.titulo === "Médias de férias"),
  );
  const todas = [...mantidas, ...criticas];
  return { ...resultado, criticas: todas, status: piorStatus(todas) };
}
