// Relatório de CAT (Comunicado de Acidente de Trabalho). Largura fixa, sem cabeçalho de empresa
// nem período — casa por matrícula, igual situação/afastamentos. Cada linha é um acidente; a
// descrição vem truncada pelo próprio relatório (largura fixa curta), não tem como recuperar o
// texto completo a partir do arquivo.

export type CatLinha = {
  matricula: string;
  nome: string;
  dataAcidente: Date;
  dataEmissao: Date;
  houveAfastamento: boolean;
  numeroCat: string | null;
  tipoAcidente: string;
  descricaoAcidente: string;
  situacaoFuncionario: string;
  codSetor: string;
  descSetor: string;
};

export type CatParseResult = {
  linhas: CatLinha[];
};

const LINHA_DADOS =
  /^\s*(\d{6})\s+(.+?)\s{2,}(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([SN])\s*(\S+)?\s+(\d+)\s+(.+?)\s{2,}([A-Z])\s+(\d+)\s+(.+?)\s{2,}\S+\s*$/;

function parseData(dia: string, mes: string, ano: string): Date {
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

function parseDataBr(str: string): Date {
  const [d, m, a] = str.split("/");
  return parseData(d, m, a);
}

export function parseCat(conteudo: string): CatParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  const linhas: CatLinha[] = [];
  for (const linha of linhasArquivo) {
    const m = LINHA_DADOS.exec(linha);
    if (!m) continue;

    const [
      ,
      matricula,
      nome,
      dtAcidente,
      dtEmissao,
      houveAfastCat,
      numeroCat,
      tipoAcidente,
      descricaoAcidente,
      situacaoFuncionario,
      codSetor,
      descSetor,
    ] = m;

    linhas.push({
      matricula,
      nome: nome.trim().replace(/\s+/g, " "),
      dataAcidente: parseDataBr(dtAcidente),
      dataEmissao: parseDataBr(dtEmissao),
      houveAfastamento: houveAfastCat === "S",
      numeroCat: numeroCat ?? null,
      tipoAcidente,
      descricaoAcidente: descricaoAcidente.trim().replace(/\s+/g, " "),
      situacaoFuncionario,
      codSetor,
      descSetor: descSetor.trim().replace(/\s+/g, " "),
    });
  }

  if (linhas.length === 0) {
    throw new Error("Nenhuma linha de CAT foi reconhecida no arquivo.");
  }

  return { linhas };
}
