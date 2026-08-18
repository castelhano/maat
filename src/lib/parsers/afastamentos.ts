// Relatório 2 (afastamentos). Cada matrícula pode aparecer várias vezes — uma linha por
// afastamento já ocorrido. As que têm DTRETAFAST preenchida já foram encerradas (o colaborador
// voltou); a que não tem é o afastamento em curso, e é essa que nos interessa pra sincronizar
// o cadastro. Não traz cabeçalho de empresa — casa por matrícula, igual ao arquivo de situação/VR.
//
// O ERP exporta esse relatório em pelo menos duas variantes de colunas, então detectamos pelo
// cabeçalho em vez de assumir uma só:
// - com DTADMFUNC: ...DTAFAST [DTRETAFAST] DTADMFUNC [DTNASCTOFUNC] [LICENCAMATERN] — a
//   admissão é sempre a última data restante, o nascimento (quando presente) vem depois dela.
// - sem DTADMFUNC (ex. relatório de afastados por unidade): ...DTAFAST [DTRETAFAST] — não há
//   coluna de admissão nenhuma; a única data que pode sobrar é o retorno.
// dataAdmissao não é usado por quem consome o parser (só serve de contexto/depuração), então
// fica opcional — ausente quando o arquivo não traz essa coluna.

export type AfastamentoLinha = {
  matricula: string;
  nome: string;
  motivo: string;
  dataAfastamento: Date;
  dataAdmissao: Date | null;
};

export type AfastamentosParseResult = {
  linhas: AfastamentoLinha[];
};

const LINHA_DADOS =
  /^\s*(\d{6})\s+(.+?)\s{2,}(.+?)\s+([A-Z])\s+(?:\d{6,}\s+)?(\d{2}\/\d{2}\/\d{4})\s*(.*)$/;
const DATA = /(\d{2})\/(\d{2})\/(\d{4})/g;

function parseData(dia: string, mes: string, ano: string): Date {
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

function extrairDatas(texto: string): Date[] {
  return [...texto.matchAll(DATA)].map((m) => parseData(m[1], m[2], m[3]));
}

export function parseAfastamentos(conteudo: string): AfastamentosParseResult {
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
    const m = LINHA_DADOS.exec(linha);
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
    });
  }

  return { linhas };
}
