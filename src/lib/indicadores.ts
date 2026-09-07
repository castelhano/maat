// Vocabulário compartilhado entre a importação do PDF mensal (Central de Importações) e o
// dashboard de indicadores — nomes/rótulos dos campos e das 4 áreas acompanhadas.

// Campos CRUS, exatamente como saem do PDF de uma competência (ou editados manualmente na tela de
// importação). O IRRF "do mês" que o dashboard mostra NÃO está aqui — ele é montado combinando
// irrfFerias desta competência com irrfNormal da competência ANTERIOR (ver calcularDerivados).
export const CAMPOS_INDICADOR = [
  "ativos",
  "admitidos",
  "desligados",
  "afastados",
  "folhaBruta",
  "liquidoPagar",
  "horaExtra",
  "horaExtraHoras",
  "faltasDias",
  "faltasValor",
  "atestadosDias",
  "atestadosValor",
  "inssRetido",
  "fgts",
  "irrfFerias",
  "irrfNormal",
  "custoBeneficios",
] as const;

export type CampoIndicador = (typeof CAMPOS_INDICADOR)[number];

export const CAMPO_LABEL: Record<CampoIndicador, string> = {
  ativos: "Ativos",
  admitidos: "Admitidos",
  desligados: "Desligados",
  afastados: "Afastados",
  folhaBruta: "Folha bruta (R$)",
  liquidoPagar: "Líquido a pagar (R$)",
  horaExtra: "Hora extra 50% (R$)",
  horaExtraHoras: "Hora extra 50% (h)",
  faltasDias: "Faltas (dias)",
  faltasValor: "Faltas (R$)",
  atestadosDias: "Atestados (dias)",
  atestadosValor: "Atestados (R$)",
  inssRetido: "INSS retido funcionário (R$)",
  fgts: "FGTS (R$)",
  irrfFerias: "IRRF férias (R$)",
  irrfNormal: "IRRF normal (R$)",
  custoBeneficios: "Custo benefícios (R$)",
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
  custoTotalEmpregador: number;
  encargos: number;
  custoPorFuncionario: number;
  percentualEncargos: number;
  taxaRotatividade: number;
};

// `irrf` já vem pronto (montado por quem chama, combinando competências — ver
// src/app/admin/indicadores/actions.ts) — aqui só entram os demais indicadores derivados.
//
// Custo total do empregador = folha bruta (já inclui hora extra) + FGTS + benefícios. O INSS
// aqui é só o retido do funcionário (não tem a parte patronal separada no relatório), por isso
// fica de fora do custo do empregador e só entra no indicador de encargos.
export function calcularDerivados<T extends Record<CampoIndicador, number> & { irrf: number }>(
  l: T
): ComDerivados<T> {
  const custoTotalEmpregador = l.folhaBruta + l.fgts + l.custoBeneficios;
  const encargos = l.inssRetido + l.fgts + l.irrf;
  const diasAusencia = l.faltasDias + l.atestadosDias;
  return {
    ...l,
    diasAusencia,
    custoTotalEmpregador,
    encargos,
    custoPorFuncionario: l.ativos > 0 ? custoTotalEmpregador / l.ativos : 0,
    percentualEncargos: l.folhaBruta > 0 ? (encargos / l.folhaBruta) * 100 : 0,
    taxaRotatividade: l.ativos > 0 ? (l.desligados / l.ativos) * 100 : 0,
  };
}
