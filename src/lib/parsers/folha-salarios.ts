export type FolhaSalariosLinha = {
  matricula: string;
  nome: string;
  dataAdmissao: Date;
  funcao: string;
  salario: number;
};

export type FolhaSalariosParseResult = {
  empresa: { codigo: string; nome: string };
  competencia: string;
  linhas: FolhaSalariosLinha[];
};

const LINHA_DADOS = /^(\d{6})\s(.*)$/;
const DATA = /(\d{2})\/(\d{2})\/(\d{2})/;
const VALOR = /[\d.]+,\d{2}/;
const EMPRESA = /^(\d{3})\s+(.+?)\s{2,}P[áa]gina/;
const COMPETENCIA = /SAL[ÁA]RIOS\s+(\d{2}\/\d{4})/;
const TOTAL_GERAL = /^TOTAL GERAL\s*:\s*(\d+)\s+([\d.]+,\d{2})/;

function parseValorMonetario(valor: string): number {
  return Number(valor.replace(/\./g, "").replace(",", "."));
}

function parseDataAdmissao(dia: string, mes: string, anoAbrev: string): Date {
  const anoCorrenteAbrev = new Date().getFullYear() % 100;
  const ano = Number(anoAbrev) <= anoCorrenteAbrev ? 2000 + Number(anoAbrev) : 1900 + Number(anoAbrev);
  return new Date(Date.UTC(ano, Number(mes) - 1, Number(dia)));
}

export function parseFolhaSalarios(conteudo: string): FolhaSalariosParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  let empresa: { codigo: string; nome: string } | null = null;
  let competencia: string | null = null;
  let totalGeral: { quantidade: number; salario: number } | null = null;
  const linhas: FolhaSalariosLinha[] = [];

  for (const linha of linhasArquivo) {
    if (!empresa) {
      const m = EMPRESA.exec(linha);
      if (m) empresa = { codigo: m[1], nome: m[2].trim() };
    }
    if (!competencia) {
      const m = COMPETENCIA.exec(linha);
      if (m) competencia = m[1];
    }
    if (!totalGeral) {
      const m = TOTAL_GERAL.exec(linha);
      if (m) totalGeral = { quantidade: Number(m[1]), salario: parseValorMonetario(m[2]) };
    }

    const dadosMatch = LINHA_DADOS.exec(linha);
    if (!dadosMatch) continue;

    const matricula = dadosMatch[1];
    const resto = dadosMatch[2];

    const dataMatch = DATA.exec(resto);
    if (!dataMatch) {
      throw new Error(`Matrícula ${matricula}: não encontrei a data de admissão na linha.`);
    }
    const nome = resto.slice(0, dataMatch.index).trim();

    const aposData = resto.slice(dataMatch.index + dataMatch[0].length);
    const valorMatch = VALOR.exec(aposData);
    if (!valorMatch) {
      throw new Error(`Matrícula ${matricula}: não encontrei o salário na linha.`);
    }
    const funcao = aposData.slice(0, valorMatch.index).trim();
    const salario = parseValorMonetario(valorMatch[0]);

    linhas.push({
      matricula,
      nome,
      dataAdmissao: parseDataAdmissao(dataMatch[1], dataMatch[2], dataMatch[3]),
      funcao,
      salario,
    });
  }

  if (!empresa) {
    throw new Error("Não encontrei o cabeçalho da empresa no arquivo. Formato inesperado.");
  }
  if (!competencia) {
    throw new Error("Não encontrei a competência (mês/ano) do relatório no arquivo.");
  }
  if (linhas.length === 0) {
    throw new Error("Nenhuma linha de funcionário foi reconhecida no arquivo.");
  }

  if (totalGeral) {
    if (totalGeral.quantidade !== linhas.length) {
      throw new Error(
        `Divergência na conferência: o arquivo informa ${totalGeral.quantidade} funcionário(s) no rodapé, mas eu reconheci ${linhas.length} linha(s). O parser pode ter pulado ou mal-interpretado alguma linha.`
      );
    }
    const somaSalarios = linhas.reduce((acc, l) => acc + l.salario, 0);
    if (Math.abs(somaSalarios - totalGeral.salario) > 0.01) {
      throw new Error(
        `Divergência na conferência: soma dos salários reconhecidos (${somaSalarios.toFixed(2)}) não bate com o total do rodapé do arquivo (${totalGeral.salario.toFixed(2)}).`
      );
    }
  }

  return { empresa, competencia, linhas };
}
