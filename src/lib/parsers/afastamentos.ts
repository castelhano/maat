// Relatório 2 (afastamentos). Cada matrícula pode aparecer várias vezes — uma linha por
// afastamento já ocorrido. As que têm DTRETAFAST preenchida já foram encerradas (o colaborador
// voltou); a que não tem é o afastamento em curso, e é essa que nos interessa pra sincronizar
// o cadastro. Não traz cabeçalho de empresa — casa por matrícula, igual ao arquivo de situação/VR.
//
// O layout completo do ERP traz colunas extras que não usamos (PISNUMERO entre a situação e a
// data de afastamento; DTNASCTOFUNC depois da admissão; LICENCAMATERN no fim, às vezes vazia em
// todas as linhas) — em vez de exigir que o usuário edite o arquivo antes de importar, o parser
// ignora essas colunas sozinho.

export type AfastamentoLinha = {
  matricula: string;
  nome: string;
  motivo: string;
  dataAfastamento: Date;
  dataAdmissao: Date;
};

export type AfastamentosParseResult = {
  linhas: AfastamentoLinha[];
};

const LINHA_DADOS =
  /^\s*(\d{6})\s+(.+?)\s{2,}(.+?)\s+([A-Z])\s+(?:\d{6,}\s+)?(\d{2}\/\d{2}\/\d{4})\s+(.*)$/;
const DATA = /(\d{2})\/(\d{2})\/(\d{4})/g;

function parseData(dia: string, mes: string, ano: string): Date {
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

function extrairDatas(texto: string): Date[] {
  return [...texto.matchAll(DATA)].map((m) => parseData(m[1], m[2], m[3]));
}

export function parseAfastamentos(conteudo: string): AfastamentosParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);
  // Coluna opcional do layout completo do ERP — quando presente, a última data de cada linha
  // é o nascimento, não a admissão, e precisa ser descartada antes de interpretar o resto.
  const temNascimento = /DTNASCTOFUNC/.test(conteudo);

  type LinhaBruta = {
    matricula: string;
    nome: string;
    motivo: string;
    dataAfastamento: Date;
    dataRetorno: Date | null;
    dataAdmissao: Date;
  };
  const brutas: LinhaBruta[] = [];

  for (const linha of linhasArquivo) {
    const m = LINHA_DADOS.exec(linha);
    if (!m) continue;

    const [, matricula, motivo, nome, , dtAfastStr, resto] = m;

    const [dAfast, mAfast, aAfast] = dtAfastStr.split("/");
    const dataAfastamento = parseData(dAfast, mAfast, aAfast);
    let datasResto = extrairDatas(resto);

    if (datasResto.length === 0) {
      throw new Error(`Matrícula ${matricula}: não encontrei a data de admissão na linha.`);
    }
    // A data de nascimento (quando o arquivo traz) é sempre a última do que sobra — descarta.
    if (temNascimento && datasResto.length > 1) datasResto = datasResto.slice(0, -1);

    const dataAdmissao = datasResto[datasResto.length - 1];
    const dataRetorno = datasResto.length > 1 ? datasResto[0] : null;

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
