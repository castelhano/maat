// Regras que variam por empresa (ver campos "Regras por empresa" em Empresa no schema). As
// empresas originais ficam nos padrões; a LOGTRANS, por exemplo, usa período de benefícios de 21
// a 20, vale gás mensal, VA de valor fixo, banco de horas pelo extrato e calendário de férias
// mensal.

export type CidadeEmpresa = { codigo: string; nome: string; valorValeGas: number | null };
export type ValorVaCargo = { cargo: string; valor: number };

export type RegrasEmpresa = {
  beneficioPeriodoDiaInicio: number | null;
  faltasPerdeBeneficio: number;
  valeGasMensal: boolean;
  valeGasRegraSuspensao: boolean;
  vaRegra: "percentual" | "fixo";
  vaValorFixo: number | null;
  vaValoresPorCargo: ValorVaCargo[];
  vaDiaMantemDesligado: number;
  cidades: CidadeEmpresa[];
  bancoHorasModo: "calculado" | "extrato";
  feriasCalendario: "quinzena" | "mensal";
};

type EmpresaComRegras = {
  beneficioPeriodoDiaInicio: number | null;
  faltasPerdeBeneficio: number;
  valeGasMensal: boolean;
  valeGasRegraSuspensao: boolean;
  vaRegra: string;
  vaValorFixo: { toNumber(): number } | null;
  vaValoresPorCargo: string | null;
  vaDiaMantemDesligado: number;
  cidades: string | null;
  bancoHorasModo: string;
  feriasCalendario: string;
};

function lerJson<T>(texto: string | null, validar: (item: unknown) => item is T): T[] {
  if (!texto) return [];
  try {
    const valor: unknown = JSON.parse(texto);
    return Array.isArray(valor) ? valor.filter(validar) : [];
  } catch {
    return [];
  }
}

const ehCidade = (i: unknown): i is CidadeEmpresa =>
  typeof i === "object" && i !== null && typeof (i as CidadeEmpresa).codigo === "string" && typeof (i as CidadeEmpresa).nome === "string";

const ehValorCargo = (i: unknown): i is ValorVaCargo =>
  typeof i === "object" && i !== null && typeof (i as ValorVaCargo).cargo === "string" && typeof (i as ValorVaCargo).valor === "number";

export function regrasDaEmpresa(e: EmpresaComRegras): RegrasEmpresa {
  return {
    beneficioPeriodoDiaInicio: e.beneficioPeriodoDiaInicio,
    faltasPerdeBeneficio: e.faltasPerdeBeneficio,
    valeGasMensal: e.valeGasMensal,
    valeGasRegraSuspensao: e.valeGasRegraSuspensao,
    vaRegra: e.vaRegra === "fixo" ? "fixo" : "percentual",
    vaValorFixo: e.vaValorFixo?.toNumber() ?? null,
    vaValoresPorCargo: lerJson(e.vaValoresPorCargo, ehValorCargo),
    vaDiaMantemDesligado: e.vaDiaMantemDesligado,
    cidades: lerJson(e.cidades, ehCidade).map((c) => ({ ...c, valorValeGas: typeof c.valorValeGas === "number" ? c.valorValeGas : null })),
    bancoHorasModo: e.bancoHorasModo === "extrato" ? "extrato" : "calculado",
    feriasCalendario: e.feriasCalendario === "mensal" ? "mensal" : "quinzena",
  };
}

function normalizarFuncao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Valor de VA da empresa com regra "fixo": a exceção da função (ex.: MOT RODOVIARIO = 653,28)
// ou o valor fixo geral da empresa. null quando a empresa não usa valor fixo.
export function valorVaFixoDaEmpresa(regras: RegrasEmpresa, funcao: string): number | null {
  if (regras.vaRegra !== "fixo") return null;
  const alvo = normalizarFuncao(funcao);
  const excecao = regras.vaValoresPorCargo.find((v) => normalizarFuncao(v.cargo) === alvo);
  return excecao?.valor ?? regras.vaValorFixo;
}

// Cidade pelo 2º bloco da Divisão da folha (ex.: "0011.0099.0075.0001" → "0099").
export function cidadeDaDivisao(divisao: string, cidades: CidadeEmpresa[]): CidadeEmpresa | null {
  const codigo = divisao.split(".")[1]?.trim();
  if (!codigo) return null;
  return cidades.find((c) => c.codigo === codigo) ?? null;
}

// Período de apuração das faltas da cesta básica (e do vale gás mensal) da competência. Datas à
// meia-noite UTC, mesmo padrão de Falta.data: o fim é o último dia do período (inclusive).
export function periodoBeneficio(competencia: { ano: number; mes: number }, diaInicio: number | null): { inicio: Date; fim: Date } {
  if (diaInicio === null) {
    return {
      inicio: new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1)),
      fim: new Date(Date.UTC(competencia.ano, competencia.mes, 0)),
    };
  }
  return {
    inicio: new Date(Date.UTC(competencia.ano, competencia.mes - 2, diaInicio)),
    fim: new Date(Date.UTC(competencia.ano, competencia.mes - 1, diaInicio - 1)),
  };
}
