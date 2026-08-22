// Relatório 2 (afastamentos). O ERP exporta esse relatório em formatos bem diferentes conforme a
// tela usada — por isso este arquivo detecta o formato pelo conteúdo em vez de assumir um só:
//
// 1) TXT de largura fixa ("relatório de situação atual"): cada matrícula pode aparecer várias
//    vezes — uma linha por afastamento já ocorrido. A linha sem DTRETAFAST é o afastamento em
//    curso; é sempre isso que o arquivo representa (não lista quem já voltou). Detecta variantes
//    de colunas pelo cabeçalho (DTADMFUNC, DTNASCTOFUNC) — ver parseAfastamentosTxt.
//
// 2) CSV mensal ("LstAfastados.RPT" / "que se afastaram ou retornaram"): uma linha por evento
//    dentro do período do relatório, já trazendo a empresa e, quando preenchida, a data de
//    retorno — ou seja, ao contrário do TXT, ESSE formato pode legitimamente listar gente que já
//    voltou ao trabalho (retornou = true), e é isso que aciona a volta pra "ativo" na importação.

export type AfastamentoLinha = {
  matricula: string;
  nome: string;
  motivo: string;
  dataAfastamento: Date;
  dataAdmissao: Date | null;
  // Só o formato CSV mensal traz esses dois campos; no TXT ficam sempre null/undefined.
  empresaCodigo: string | null;
  // Preenchida quando esse afastamento já terminou (o colaborador voltou) — usado para reverter
  // o cadastro pra "ativo" em vez de marcar como afastado.
  dataRetorno: Date | null;
};

export type AfastamentosParseResult = {
  linhas: AfastamentoLinha[];
};

function parseData(dia: string, mes: string, ano: string): Date {
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

// --- Formato 1: TXT de largura fixa ---------------------------------------------------------

const LINHA_DADOS_TXT =
  /^\s*(\d{6})\s+(.+?)\s{2,}(.+?)\s+([A-Z])\s+(?:\d{6,}\s+)?(\d{2}\/\d{2}\/\d{4})\s*(.*)$/;
const DATA = /(\d{2})\/(\d{2})\/(\d{4})/g;

function extrairDatas(texto: string): Date[] {
  return [...texto.matchAll(DATA)].map((m) => parseData(m[1], m[2], m[3]));
}

function parseAfastamentosTxt(conteudo: string): AfastamentoLinha[] {
  const linhasArquivo = conteudo.split(/\r?\n/);
  const temAdmissao = /DTADMFUNC/.test(conteudo);
  // Coluna opcional do layout completo do ERP — quando presente, a última data de cada linha
  // é o nascimento, não a admissão, e precisa ser descartada antes de interpretar o resto.
  const temNascimento = /DTNASCTOFUNC/.test(conteudo);

  type LinhaBruta = {
    matricula: string;
    nome: string;
    motivo: string;
    dataAfastamento: Date;
    dataRetorno: Date | null;
    dataAdmissao: Date | null;
  };
  const brutas: LinhaBruta[] = [];

  for (const linha of linhasArquivo) {
    const m = LINHA_DADOS_TXT.exec(linha);
    if (!m) continue;

    const [, matricula, motivo, nome, , dtAfastStr, resto] = m;

    const [dAfast, mAfast, aAfast] = dtAfastStr.split("/");
    const dataAfastamento = parseData(dAfast, mAfast, aAfast);
    let datasResto = extrairDatas(resto);

    let dataAdmissao: Date | null;
    let dataRetorno: Date | null;

    if (temAdmissao) {
      if (datasResto.length === 0) {
        throw new Error(`Matrícula ${matricula}: não encontrei a data de admissão na linha.`);
      }
      // A data de nascimento (quando o arquivo traz) é sempre a última do que sobra — descarta.
      if (temNascimento && datasResto.length > 1) datasResto = datasResto.slice(0, -1);

      dataAdmissao = datasResto[datasResto.length - 1];
      dataRetorno = datasResto.length > 1 ? datasResto[0] : null;
    } else {
      dataAdmissao = null;
      dataRetorno = datasResto.length > 0 ? datasResto[0] : null;
    }

    brutas.push({
      matricula,
      nome: nome.trim().replace(/\s+/g, " "),
      motivo: motivo.trim().replace(/\s+/g, " "),
      dataAfastamento,
      dataRetorno,
      dataAdmissao,
    });
  }

  if (brutas.length === 0) {
    throw new Error("Nenhuma linha de afastamento foi reconhecida no arquivo.");
  }

  const porMatricula = new Map<string, LinhaBruta[]>();
  for (const b of brutas) {
    const lista = porMatricula.get(b.matricula) ?? [];
    lista.push(b);
    porMatricula.set(b.matricula, lista);
  }

  const linhas: AfastamentoLinha[] = [];
  for (const [matricula, historico] of porMatricula) {
    const emAberto = historico.filter((h) => h.dataRetorno === null);
    if (emAberto.length === 0) {
      throw new Error(
        `Matrícula ${matricula}: todos os afastamentos do histórico têm data de retorno preenchida — nenhum afastamento em curso encontrado, mas o arquivo lista essa matrícula como afastada.`
      );
    }
    if (emAberto.length > 1) {
      throw new Error(
        `Matrícula ${matricula}: encontrei mais de um afastamento em curso (sem data de retorno) no histórico — confira o arquivo.`
      );
    }
    const atual = emAberto[0];
    linhas.push({
      matricula,
      nome: atual.nome,
      motivo: atual.motivo,
      dataAfastamento: atual.dataAfastamento,
      dataAdmissao: atual.dataAdmissao,
      empresaCodigo: null,
      dataRetorno: null,
    });
  }

  return linhas;
}

// --- Formato 2: CSV mensal (LstAfastados.RPT) -------------------------------------------------
//
// Exportação do Crystal Reports que repete os rótulos de cabeçalho e o rodapé de totais em TODA
// linha (peculiaridade desse relatório específico) — em vez de depender de posição fixa de
// coluna, localizamos os rótulos "Empresa:" e "Motivo" em cada linha e lemos os campos a partir
// deles, o que também tolera o rodapé de totais variar de tamanho.

const CSV_ASSINATURA = /se afastaram ou retornaram|LstAfastados/i;
const COLUNAS_DADOS = ["Registro", "Divisões", "Nome", "Função", "Admis.", "Afast.", "Ult Dia", "Cid", "Retor.", "Dias", "Motivo"];

function parseLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === ",") {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

function parseDataOuNull(str: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str.trim());
  if (!m) return null;
  return parseData(m[1], m[2], m[3]);
}

function parseAfastamentosCsvMensal(conteudo: string): AfastamentoLinha[] {
  const linhasArquivo = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const brutas: AfastamentoLinha[] = [];

  for (const linha of linhasArquivo) {
    const campos = parseLinhaCsv(linha);

    const idxEmpresaLabel = campos.findIndex((c) => c.trim() === "Empresa:");
    const idxMotivoLabel = campos.findIndex((c) => c.trim() === "Motivo");
    if (idxEmpresaLabel === -1 || idxMotivoLabel === -1) continue;

    const empresaCampo = (campos[idxEmpresaLabel + 1] ?? "").trim();
    const espaco = empresaCampo.indexOf(" ");
    const empresaCodigo = (espaco === -1 ? empresaCampo : empresaCampo.slice(0, espaco)).trim() || null;

    const dados = campos.slice(idxMotivoLabel + 1, idxMotivoLabel + 1 + COLUNAS_DADOS.length);
    if (dados.length < COLUNAS_DADOS.length) continue;
    const [matricula, , nome, , admisStr, afastStr, , , retorStr, , motivo] = dados;

    const dataAfastamento = parseDataOuNull(afastStr);
    if (!matricula.trim() || !dataAfastamento) continue;

    brutas.push({
      matricula: matricula.trim(),
      nome: nome.trim().replace(/\s+/g, " "),
      motivo: motivo.trim().replace(/\s+/g, " "),
      dataAfastamento,
      dataAdmissao: parseDataOuNull(admisStr),
      empresaCodigo,
      dataRetorno: parseDataOuNull(retorStr),
    });
  }

  if (brutas.length === 0) {
    throw new Error("Nenhuma linha de afastamento/retorno foi reconhecida no arquivo.");
  }

  // Se a mesma matrícula aparecer mais de uma vez no período (afastou e voltou mais de uma vez
  // no mesmo mês, por exemplo), fica só o evento mais recente.
  const porMatricula = new Map<string, AfastamentoLinha>();
  for (const b of brutas) {
    const atual = porMatricula.get(b.matricula);
    if (!atual || b.dataAfastamento.getTime() > atual.dataAfastamento.getTime()) {
      porMatricula.set(b.matricula, b);
    }
  }

  return [...porMatricula.values()];
}

export function parseAfastamentos(conteudo: string): AfastamentosParseResult {
  const linhas = CSV_ASSINATURA.test(conteudo)
    ? parseAfastamentosCsvMensal(conteudo)
    : parseAfastamentosTxt(conteudo);

  return { linhas };
}
