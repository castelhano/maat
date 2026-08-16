// Extrato do banco de horas. Fonte confiável: apenas matrícula, competência, crédito e débito —
// saldo anterior/atual e hora paga do próprio arquivo são inconsistentes e nunca são usados (o
// motor de cálculo em src/lib/banco-horas.ts recalcula tudo a partir daqui).

export type BancoHorasLinha = {
  matricula: string;
  competencia: string; // "MM/AAAA"
  creditoDecimal: number; // horas, ex. 7.5 = 7h30
  debitoDecimal: number;
};

export type BancoHorasParseResult = {
  empresa: { codigo: string; nome: string };
  periodoInicio: string; // "MM/AAAA"
  periodoFim: string; // "MM/AAAA"
  linhas: BancoHorasLinha[];
};

const PERIODO = /Periodo:\s*(\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{4})/i;
const EMPRESA = /^Empresa\s*:\s*(\d{3})\s+(.+?)\s+\d{2}:\d{2}\s*$/m;
const FUNCIONARIO = /^Funcionario:\s*(\d{6})\/\d{6}\s+.+$/;
const COMPETENCIA_LINHA = /^\s*(\d{2}\/\d{4})\s+(-?\d+):(\d{2})\s+(-?\d+):(\d{2})/;

function hhmmToDecimal(sinal: string, horas: string, minutos: string): number {
  const valor = Number(horas) + Number(minutos) / 60;
  return sinal === "-" ? -valor : valor;
}

export function parseBancoHoras(conteudo: string): BancoHorasParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  const periodoMatch = PERIODO.exec(conteudo);
  if (!periodoMatch) {
    throw new Error("Não encontrei o período do extrato (\"Periodo: MM/AAAA a MM/AAAA\") no arquivo.");
  }
  const periodoInicio = periodoMatch[1];
  const periodoFim = periodoMatch[2];

  const empresaMatch = EMPRESA.exec(conteudo);
  if (!empresaMatch) {
    throw new Error("Não encontrei o cabeçalho da empresa (\"Empresa : ...\") no arquivo.");
  }
  const empresa = { codigo: empresaMatch[1], nome: empresaMatch[2].trim() };

  const linhas: BancoHorasLinha[] = [];
  let matriculaAtual: string | null = null;

  for (const linhaBruta of linhasArquivo) {
    const funcionarioMatch = FUNCIONARIO.exec(linhaBruta.trim());
    if (funcionarioMatch) {
      matriculaAtual = funcionarioMatch[1];
      continue;
    }

    const competenciaMatch = COMPETENCIA_LINHA.exec(linhaBruta);
    if (competenciaMatch && matriculaAtual) {
      const [, competencia, creditoH, creditoM, debitoH, debitoM] = competenciaMatch;
      const creditoSinal = creditoH.startsWith("-") ? "-" : "";
      const debitoSinal = debitoH.startsWith("-") ? "-" : "";
      linhas.push({
        matricula: matriculaAtual,
        competencia,
        creditoDecimal: hhmmToDecimal(creditoSinal, creditoH.replace("-", ""), creditoM),
        debitoDecimal: hhmmToDecimal(debitoSinal, debitoH.replace("-", ""), debitoM),
      });
    }
  }

  if (linhas.length === 0) {
    throw new Error("Nenhuma linha de competência foi reconhecida no extrato.");
  }

  return { empresa, periodoInicio, periodoFim, linhas };
}

// Saldo de abertura (marco zero, dez/2025): "MATRICULA\tVALOR" por linha, valor em horas
// decimais (não HH:MM) com vírgula, ex. "12,50" = 12h30, ou "-" quando o saldo é zero.
export type BancoHorasSaldoInicialLinha = { matricula: string; saldoDecimal: number };

export function parseBancoHorasSaldoInicial(conteudo: string): BancoHorasSaldoInicialLinha[] {
  const resultado: BancoHorasSaldoInicialLinha[] = [];
  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha) continue;
    const partes = linha.split("\t");
    if (partes.length < 2) continue;
    const matricula = partes[0].trim();
    const valorStr = partes[1].trim();
    if (!/^\d{6}$/.test(matricula)) continue;
    if (valorStr === "-") {
      resultado.push({ matricula, saldoDecimal: 0 });
      continue;
    }
    const negativo = valorStr.startsWith("-");
    const limpo = (negativo ? valorStr.slice(1) : valorStr).replace(",", ".");
    const valor = Number(limpo);
    if (Number.isNaN(valor)) {
      throw new Error(`Matrícula ${matricula}: valor de saldo inicial inválido ("${valorStr}").`);
    }
    resultado.push({ matricula, saldoDecimal: negativo ? -valor : valor });
  }
  if (resultado.length === 0) {
    throw new Error("Nenhuma linha de saldo inicial foi reconhecida no arquivo.");
  }
  return resultado;
}
