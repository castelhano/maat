// Relatório 3 (faltas por ocorrência). Traz um período explícito ("Periodo de: dd/mm/aaaa a
// dd/mm/aaaa"), do qual a competência pode ser sugerida quando o período é um mês cheio — mas
// quem decide a competência de fato é o usuário na tela, isso aqui só serve pra conferência.

export type FaltaLinha = {
  matricula: string;
  nome: string;
  funcao: string;
  datas: Date[];
};

export type FaltasParseResult = {
  empresa: { codigo: string; nome: string };
  periodo: { inicio: Date; fim: Date };
  competenciaSugerida: string | null;
  linhas: FaltaLinha[];
};

const EMPRESA = /^Empresa\s*:\s*(\d{3})\s+(.+?)\s*$/m;
const PERIODO = /Periodo de\s*:\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const LINHA_REGISTRO = /^(\d{6})\s+(.+?)\s{2,}(.+?)\s+(\d+)\s+(.*)$/;
const LINHA_CONTINUACAO_DATAS = /^(?:\d{2}\/\d{2}\/\d{4}\s*)+$/;
const TOTAL_FUNC = /TOTAL FUNC\s*-+>\s*(\d+)/;
const TOTAL_GERAL = /TOTAL GERAL\s*-+>\s*(\d+)/;
const DATA = /(\d{2})\/(\d{2})\/(\d{4})/g;

function parseData(dia: string, mes: string, ano: string): Date {
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

function extrairDatas(texto: string): Date[] {
  return [...texto.matchAll(DATA)].map((m) => parseData(m[1], m[2], m[3]));
}

function competenciaDoPeriodo(inicio: Date, fim: Date): string | null {
  const inicioEhDia1 = inicio.getUTCDate() === 1;
  const ultimoDiaDoMes = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() + 1, 0)).getUTCDate();
  const fimEhUltimoDia = fim.getUTCDate() === ultimoDiaDoMes;
  const mesmoMes = inicio.getUTCFullYear() === fim.getUTCFullYear() && inicio.getUTCMonth() === fim.getUTCMonth();
  if (!mesmoMes || !inicioEhDia1 || !fimEhUltimoDia) return null;
  const mes = String(inicio.getUTCMonth() + 1).padStart(2, "0");
  return `${mes}/${inicio.getUTCFullYear()}`;
}

export function parseFaltas(conteudo: string): FaltasParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  const empresaMatch = EMPRESA.exec(conteudo);
  if (!empresaMatch) {
    throw new Error("Não encontrei o cabeçalho da empresa no arquivo. Formato inesperado.");
  }
  const empresa = { codigo: empresaMatch[1], nome: empresaMatch[2].trim() };

  const periodoMatch = PERIODO.exec(conteudo);
  if (!periodoMatch) {
    throw new Error("Não encontrei o período do relatório no arquivo.");
  }
  const [, dIni, mIni, aIni, dFim, mFim, aFim] = periodoMatch;
  const periodo = { inicio: parseData(dIni, mIni, aIni), fim: parseData(dFim, mFim, aFim) };

  const linhas: FaltaLinha[] = [];
  let totalFuncRodape: number | null = null;
  let totalGeralRodape: number | null = null;

  for (const linha of linhasArquivo) {
    const registroMatch = LINHA_REGISTRO.exec(linha);
    if (registroMatch) {
      const [, matricula, nome, funcao, qtde, detalhe] = registroMatch;
      linhas.push({
        matricula,
        nome: nome.trim().replace(/\s+/g, " "),
        funcao: funcao.trim().replace(/\s+/g, " "),
        datas: extrairDatas(detalhe),
      });
      // Guardamos a qtde declarada junto pra conferir depois de fechar as continuações.
      (linhas[linhas.length - 1] as FaltaLinha & { qtdeDeclarada?: number }).qtdeDeclarada = Number(qtde);
      continue;
    }

    if (LINHA_CONTINUACAO_DATAS.test(linha.trim()) && linhas.length > 0) {
      linhas[linhas.length - 1].datas.push(...extrairDatas(linha));
      continue;
    }

    const totalFuncMatch = TOTAL_FUNC.exec(linha);
    if (totalFuncMatch) totalFuncRodape = Number(totalFuncMatch[1]);

    const totalGeralMatch = TOTAL_GERAL.exec(linha);
    if (totalGeralMatch) totalGeralRodape = Number(totalGeralMatch[1]);
  }

  if (linhas.length === 0) {
    throw new Error("Nenhuma linha de falta foi reconhecida no arquivo.");
  }

  for (const l of linhas) {
    const qtdeDeclarada = (l as FaltaLinha & { qtdeDeclarada?: number }).qtdeDeclarada;
    if (qtdeDeclarada !== undefined && qtdeDeclarada !== l.datas.length) {
      throw new Error(
        `Matrícula ${l.matricula}: o arquivo declara ${qtdeDeclarada} falta(s), mas eu reconheci ${l.datas.length} data(s). O parser pode ter perdido uma linha de continuação.`
      );
    }
  }

  if (totalFuncRodape !== null && totalFuncRodape !== linhas.length) {
    throw new Error(
      `Divergência na conferência: o arquivo informa ${totalFuncRodape} funcionário(s) no rodapé (TOTAL FUNC), mas eu reconheci ${linhas.length}.`
    );
  }
  const somaFaltas = linhas.reduce((acc, l) => acc + l.datas.length, 0);
  if (totalGeralRodape !== null && totalGeralRodape !== somaFaltas) {
    throw new Error(
      `Divergência na conferência: o arquivo informa ${totalGeralRodape} falta(s) no total geral, mas a soma das linhas reconhecidas dá ${somaFaltas}.`
    );
  }

  return {
    empresa,
    periodo,
    competenciaSugerida: competenciaDoPeriodo(periodo.inicio, periodo.fim),
    linhas: linhas.map(({ matricula, nome, funcao, datas }) => ({ matricula, nome, funcao, datas })),
  };
}
