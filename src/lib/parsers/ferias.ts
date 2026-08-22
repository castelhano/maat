// Parser do relatório "Listagem de Programação de Férias" do ERP. Layout de largura fixa (um
// relatório de impressão, não um CSV) — as posições de coluna abaixo foram medidas a partir da
// linha separadora de traços que o próprio relatório imprime sob o cabeçalho.
export type FeriasLinha = {
  matricula: string;
  nome: string;
  funcao: string;
  admissao: Date;
  aquisicao: Date;
  vencimento: Date;
  limite: Date;
  meses: number;
  faltas: number;
};

export type FeriasParseResult = {
  empresa: { codigo: string; nome: string };
  dataBase: Date;
  linhas: FeriasLinha[];
};

const CABECALHO_COLUNAS = /^\s*CODIGO\s+DIVISAO/;
const LINHA_CODIGO = /^\s{0,2}(\d{6})\s/;
const EMPRESA = /^\s*Empresa:\s*(\d+)\s+(.+?)\s*$/;
const DATA_BASE = /DATA BASE:\s*(\d{2})\/(\d{2})\/(\d{4})/;
const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function parseData(campo: string, contexto: string): Date {
  const m = DATA_BR.exec(campo.trim());
  if (!m) throw new Error(`${contexto}: data inválida "${campo}".`);
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

export function parseFerias(conteudo: string): FeriasParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  let empresa: { codigo: string; nome: string } | null = null;
  let dataBase: Date | null = null;
  let colStart: number[] | null = null;
  const linhas: FeriasLinha[] = [];

  for (let i = 0; i < linhasArquivo.length; i++) {
    const linha = linhasArquivo[i];

    if (!empresa) {
      const m = EMPRESA.exec(linha);
      if (m) empresa = { codigo: m[1], nome: m[2].trim() };
    }
    if (!dataBase) {
      const m = DATA_BASE.exec(linha);
      if (m) dataBase = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    }

    // A linha de traços logo abaixo do cabeçalho "CODIGO DIVISAO ..." define as colunas —
    // medimos por posição de caractere pra não depender de nomes/funções sem espaço duplo.
    if (!colStart && CABECALHO_COLUNAS.test(linha)) {
      const dash = linhasArquivo[i + 1] ?? "";
      const found: number[] = [];
      const re = /-+/g;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(dash))) found.push(mm.index);
      if (found.length >= 14) colStart = found;
      continue;
    }

    if (!colStart) continue;
    if (!LINHA_CODIGO.test(linha)) continue;

    const [cCodigo, , cNome, cFuncao, cAdmissao, cAquisicao, cVencimento, cLimite, cMeses, cFaltas] = colStart;
    const fim = (idx: number, next: number | undefined) => (next !== undefined ? next : idx + 12);

    const matricula = linha.slice(cCodigo, fim(cCodigo, colStart[1])).trim();
    const nome = linha.slice(cNome, fim(cNome, colStart[3])).trim();
    const funcao = linha.slice(cFuncao, fim(cFuncao, colStart[4])).trim();
    const admissaoTxt = linha.slice(cAdmissao, fim(cAdmissao, colStart[5])).trim();
    const aquisicaoTxt = linha.slice(cAquisicao, fim(cAquisicao, colStart[6])).trim();
    const vencimentoTxt = linha.slice(cVencimento, fim(cVencimento, colStart[7])).trim();
    const limiteTxt = linha.slice(cLimite, fim(cLimite, colStart[8])).trim();
    const mesesTxt = linha.slice(cMeses, fim(cMeses, colStart[9])).trim();
    const faltasTxt = linha.slice(cFaltas, fim(cFaltas, colStart[10])).trim();

    linhas.push({
      matricula,
      nome,
      funcao,
      admissao: parseData(admissaoTxt, `Matrícula ${matricula} (admissão)`),
      aquisicao: parseData(aquisicaoTxt, `Matrícula ${matricula} (aquisição)`),
      vencimento: parseData(vencimentoTxt, `Matrícula ${matricula} (vencimento)`),
      limite: parseData(limiteTxt, `Matrícula ${matricula} (limite)`),
      meses: Number(mesesTxt) || 0,
      faltas: Number(faltasTxt) || 0,
    });
  }

  if (!empresa) {
    throw new Error("Não encontrei o cabeçalho da empresa no arquivo. Formato inesperado.");
  }
  if (!dataBase) {
    throw new Error("Não encontrei a DATA BASE do relatório no arquivo.");
  }
  if (linhas.length === 0) {
    throw new Error("Nenhuma linha de colaborador foi reconhecida no arquivo.");
  }

  return { empresa, dataBase, linhas };
}

// Regra CLT: dias de férias de acordo com o número de faltas no período aquisitivo.
export function diasDireitoPorFaltas(faltas: number): number {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}
