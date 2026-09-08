// Vocabulário compartilhado entre a importação do PDF mensal (Central de Importações) e o
// dashboard de indicadores — nomes/rótulos dos campos e das 4 áreas acompanhadas.

import { feriadosNacionais } from "@/lib/feriados";

// Campos CRUS, exatamente como saem do PDF de uma competência (ou editados manualmente na tela de
// importação). O IRRF "do mês" que o dashboard mostra NÃO está aqui — ele é montado combinando
// irrfFerias desta competência com irrfNormal da competência ANTERIOR (ver calcularDerivados).
export const CAMPOS_INDICADOR = [
  "ativos",
  "admitidos",
  "desligados",
  "afastados",
  "aprendizesAtivos",
  "aprendizesAdmitidos",
  "aprendizesDesligados",
  "folhaBruta",
  "liquidoPagar",
  "horaExtra",
  "horaExtraHoras",
  "comissao",
  "folhaSuplementar",
  "faltasDias",
  "faltasValor",
  "atestadosDias",
  "atestadosValor",
  "inssRetido",
  "fgts",
  "inssPatronal",
  "acidenteTrabalho",
  "terceiros",
  "farmacia",
  "contribuicaoConfederativa",
  "contribuicaoSocial",
  "irrfFerias",
  "irrfNormal",
  "cestaBasica",
  "valeGas",
  "valeAlimentacao",
  "cafeManha",
  "refeitorio",
  "proSaude",
] as const;

export type CampoIndicador = (typeof CAMPOS_INDICADOR)[number];

// Campos "sempre editáveis" (sem código/linha própria no relatório) que agora são lançados como um
// valor TOTAL por empresa+competência (ver model RateioTotalCampo) em vez de por área — o rateio
// por área acontece na leitura: ativos da área / total de ativos da empresa × valor total (ver
// carregarIndicadores).
export const RATEIO_CAMPOS = ["folhaSuplementar", "cafeManha", "refeitorio", "proSaude"] as const satisfies readonly CampoIndicador[];
export type CampoRateio = (typeof RATEIO_CAMPOS)[number];

export const CAMPO_LABEL: Record<CampoIndicador, string> = {
  ativos: "Ativos",
  admitidos: "Admitidos",
  desligados: "Desligados",
  afastados: "Afastados",
  aprendizesAtivos: "Aprend. ativos",
  aprendizesAdmitidos: "Aprend. admit.",
  aprendizesDesligados: "Aprend. deslig.",
  folhaBruta: "Folha bruta (R$)",
  liquidoPagar: "Líq. a pagar (R$)",
  horaExtra: "Hora extra 50% (R$)",
  horaExtraHoras: "Hora extra 50% (h)",
  comissao: "Comissão (R$)",
  folhaSuplementar: "Folha suplem. (R$)",
  faltasDias: "Faltas (dias)",
  faltasValor: "Faltas (R$)",
  atestadosDias: "Atestados (dias)",
  atestadosValor: "Atestados (R$)",
  inssRetido: "INSS retido (R$)",
  fgts: "FGTS (R$)",
  inssPatronal: "INSS patronal (R$)",
  acidenteTrabalho: "RAT (R$)",
  terceiros: "Terceiros (R$)",
  farmacia: "Farmácia (R$)",
  contribuicaoConfederativa: "Confer. (R$)",
  contribuicaoSocial: "Social (R$)",
  irrfFerias: "IRRF férias (R$)",
  irrfNormal: "IRRF normal (R$)",
  cestaBasica: "Cesta básica (R$)",
  valeGas: "Vale gás (R$)",
  valeAlimentacao: "Vale aliment. (R$)",
  cafeManha: "Café da manhã (R$)",
  refeitorio: "Refeitório (R$)",
  proSaude: "Pró-saúde trab. (R$)",
};

// Mesmos valores usados em Cargo.setor — a área "OPERACAO MOTORISTA" tem que vir testada antes de
// "OPERACAO" em qualquer lugar que faça correspondência por substring.
export const SETORES_INDICADOR = [
  { valor: "MANUTENCAO", label: "Manutenção" },
  { valor: "ADMINISTRACAO", label: "Administrativo" },
  { valor: "OPERACAO", label: "Operação" },
  { valor: "OPERACAO MOTORISTA", label: "Operação Motorista" },
] as const;

export function labelSetor(setor: string): string {
  return SETORES_INDICADOR.find((s) => s.valor === setor)?.label ?? setor;
}

export function chaveCompetencia(c: string): number {
  const [m, a] = c.split("/");
  return Number(a) * 12 + Number(m);
}

export function competenciaAnterior(competencia: string): string {
  const [mes, ano] = competencia.split("/").map(Number);
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  return `${String(mesAnterior).padStart(2, "0")}/${anoAnterior}`;
}

export type ComDerivados<T> = T & {
  irrf: number;
  diasAusencia: number;
  custoBeneficios: number;
  custoTotalEmpregador: number;
  encargos: number;
  custoPorFuncionario: number;
  percentualEncargos: number;
  taxaRotatividade: number;
};

// `irrf` já vem pronto (montado por quem chama, combinando competências — ver
// src/app/admin/indicadores/actions.ts) — aqui só entram os demais indicadores derivados.
//
// Custo de benefícios = cesta básica + vale-gás + vale-alimentação (vêm do PDF) + café da manhã +
// refeitório + pró-saúde do trabalhador (sempre editáveis, sem código no relatório).
//
// Custo total do empregador = folha bruta (já inclui hora extra e comissão — são rubricas do
// próprio relatório) + folha suplementar (processada à parte, não está na folha bruta) + FGTS +
// benefícios. O INSS aqui é só o retido do funcionário (não tem a parte patronal separada no
// relatório), por isso fica de fora do custo do empregador e só entra no indicador de encargos.
//
// Encargos = INSS retido do funcionário + FGTS + IRRF + INSS patronal + Acidente de Trabalho
// (RAT/SAT) + Terceiros (Sistema S, INCRA, salário educação etc.) — os 3 últimos são encargos
// patronais extraídos do relatório (ver resumo-gerencial.ts).
export function calcularDerivados<T extends Record<CampoIndicador, number> & { irrf: number }>(
  l: T
): ComDerivados<T> {
  const custoBeneficios = l.cestaBasica + l.valeGas + l.valeAlimentacao + l.cafeManha + l.refeitorio + l.proSaude;
  const custoTotalEmpregador = l.folhaBruta + l.folhaSuplementar + l.fgts + custoBeneficios;
  const encargos = l.inssRetido + l.fgts + l.irrf + l.inssPatronal + l.acidenteTrabalho + l.terceiros;
  const diasAusencia = l.faltasDias + l.atestadosDias;
  return {
    ...l,
    diasAusencia,
    custoBeneficios,
    custoTotalEmpregador,
    encargos,
    custoPorFuncionario: l.ativos > 0 ? custoTotalEmpregador / l.ativos : 0,
    percentualEncargos: l.folhaBruta > 0 ? (encargos / l.folhaBruta) * 100 : 0,
    taxaRotatividade: taxaTurnover(l),
  };
}

// Sigla da ocorrência (como sai do relatório de faltas, ver src/lib/parsers/faltas.ts) → rótulo
// exibido no indicador de absenteísmo por motivo. Sigla sem mapeamento cai no valor cru.
export const MOTIVO_FALTA_LABEL: Record<string, string> = {
  ATM: "Atestado médico",
  FALTJ: "Falta justificada",
  FALTA: "Falta não justificada",
  SUSP: "Suspensão",
  OBITO: "Licença luto",
  PATER: "Licença paternidade",
  CASAM: "Licença casamento",
};

export function labelMotivoFalta(ocorrencia: string): string {
  return MOTIVO_FALTA_LABEL[ocorrencia] ?? ocorrencia;
}

// Dias úteis do mês da competência — usado como denominador do % de absenteísmo. Aqui "útil"
// segue a escala da operação (transporte roda de segunda a sábado): só domingo e feriado nacional
// descontam, sábado conta como dia trabalhado. Feriados municipais/estaduais não entram (mesma
// limitação do calendário em src/lib/feriados.ts).
export function diasUteisNoMes(competencia: string): number {
  const [mes, ano] = competencia.split("/").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const feriados = feriadosNacionais(ano);
  let dias = 0;
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (data.getUTCDay() === 0) continue;
    if (feriados.some((f) => f.getTime() === data.getTime())) continue;
    dias++;
  }
  return dias;
}

// Turnover = (Admitidos + Desligados) / 2 / Total de colaboradores × 100 — meta da empresa é 1,5%
// ao mês (ver META_TURNOVER em indicadores-painel.tsx). Aprendiz não entra nessa conta — descontado
// dos 3 totais antes de calcular.
function taxaTurnover(l: Record<CampoIndicador, number>): number {
  const ativos = l.ativos - l.aprendizesAtivos;
  const admitidos = l.admitidos - l.aprendizesAdmitidos;
  const desligados = l.desligados - l.aprendizesDesligados;
  return ativos > 0 ? ((admitidos + desligados) / 2 / ativos) * 100 : 0;
}
