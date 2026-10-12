// Tabelas e percentuais usados na conferência da folha, por ano. Ao virar o ano, basta incluir
// um novo bloco aqui com os valores oficiais; anos sem bloco usam o mais recente cadastrado.

export type FaixaInss = { ate: number; aliquota: number };
export type FaixaIr = { ate: number; aliquota: number; deducao: number };

export type ParametrosFolha = {
  ano: number;
  salarioMinimo: number;
  // Faixas progressivas; a última faixa é o teto.
  inss: FaixaInss[];
  ir: FaixaIr[];
  irDependente: number;
  irDescontoSimplificado: number;
  // Lei 15.270/2025: isenção até `ate` e redução decrescente até `ateParcial`
  // (redução = valorFixo − fator × rendimentos tributáveis).
  irRedutor: { ate: number; ateParcial: number; valorFixo: number; fator: number } | null;
  // Retenção de IR abaixo deste valor não é feita.
  irMinimoRetencao: number;
  fgts: number;
  fgtsAprendiz: number;
  contribuicaoConfederativa: number;
  contribuicaoSocial: number;
  // A contribuição social tem teto: o percentual aplicado sobre o salário de motorista. O salário
  // de motorista é lido da própria folha (função MOTORISTA); este valor é o padrão se não houver.
  salarioMotoristaPadrao: number;
  // Limite do e-consignado sobre (proventos − INSS − IR).
  limiteConsignado: number;
  adicionalNoturno: number;
  // Divisores de horas aceitos; o primeiro é o padrão (44h semanais).
  divisoresHora: number[];
  // Funções com jornada de 42h semanais (nome exato da função no Praxio): a hora é sempre
  // salário ÷ divisor, sem inferir.
  jornada42h: { divisor: number; funcoes: string[] };
};

const PARAMETROS: ParametrosFolha[] = [
  {
    ano: 2026,
    salarioMinimo: 1621.0,
    inss: [
      { ate: 1621.0, aliquota: 0.075 },
      { ate: 2902.84, aliquota: 0.09 },
      { ate: 4354.27, aliquota: 0.12 },
      { ate: 8475.55, aliquota: 0.14 },
    ],
    ir: [
      { ate: 2428.8, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ],
    irDependente: 189.59,
    irDescontoSimplificado: 607.2,
    irRedutor: { ate: 5000, ateParcial: 7350, valorFixo: 978.62, fator: 0.133145 },
    irMinimoRetencao: 10,
    fgts: 0.08,
    fgtsAprendiz: 0.02,
    contribuicaoConfederativa: 0.01,
    contribuicaoSocial: 0.015,
    salarioMotoristaPadrao: 3710.0,
    limiteConsignado: 0.35,
    adicionalNoturno: 0.2,
    divisoresHora: [220, 180, 200, 150, 120, 110, 100],
    jornada42h: { divisor: 210, funcoes: ["MOTORISTA", "PROMOT DE VENDA"] },
  },
];

export function parametrosDoAno(ano: number): { parametros: ParametrosFolha; exato: boolean } {
  const exato = PARAMETROS.find((p) => p.ano === ano);
  if (exato) return { parametros: exato, exato: true };
  const ordenados = [...PARAMETROS].sort((a, b) => b.ano - a.ano);
  const anterior = ordenados.find((p) => p.ano < ano) ?? ordenados[ordenados.length - 1];
  return { parametros: anterior, exato: false };
}
