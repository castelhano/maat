// Relatório "FLP - Folha de Pagamento" (Praxio). Cada funcionário tem um cabeçalho de 2 linhas
// (Funcionario/Divisao) e depois linhas de eventos em 3 colunas de largura fixa:
// proventos | descontos | bases e informativos. A última página traz o "RESUMO POR EVENTO", que
// usamos só para conferir que a leitura não pulou nenhuma linha.

export type ColunaEvento = "provento" | "desconto" | "base";

export type EventoFolha = {
  codigo: string;
  descricao: string;
  coluna: ColunaEvento;
  // "DIAS" | "HORAS" | "VALOR" | "BASE" | "INFOR"
  tipo: string;
  referencia: number | null;
  valor: number;
};

export type FuncionarioFolha = {
  matricula: string;
  nome: string;
  funcao: string;
  situacao: string;
  divisao: string;
  salarioBase: number;
  admissao: string;
  // "dd/mm/aaaa" — só preenchido quando há férias no mês.
  gozoInicio: string | null;
  gozoFim: string | null;
  eventos: EventoFolha[];
};

export type FolhaPagamentoParseResult = {
  empresa: { codigo: string; nome: string };
  // "mm/aaaa"
  competencia: string;
  funcionarios: FuncionarioFolha[];
  // Total por código de evento segundo a última página do relatório.
  resumoPorEvento: Record<string, number>;
};

const EMPRESA = /EMPRESA\s*:\s*(\d{3})\s+(.+?)\s{2,}/;
const COMPETENCIA = /COMPETENCIA:\s*\d{2}\/(\d{2})\/(\d{4})/;
const FUNCIONARIO = /Funcionario:\s*(\d{6})\/\d{6}\s*-\s*(.+?)\s{2,}(?:Funcao\s*:\s*\d{4}\s*-\s*(.+?)\s*Situacao:\s*(.*?)\s*\|?\s*$|\*\*\* CONTINUA)/;
const DIVISAO =
  /Divisao\s*:\s*(\S+).*?Salario Base:\s*([\d.]+,\d{2})\s+Admissao:\s*(\d{2}\/\d{2}\/\d{4})\s+Periodo de Gozo:\s*(?:(\d{2}\/\d{2}\/\d{4})\s*A\s*(\d{2}\/\d{2}\/\d{4}))?/;
// Código, descrição (17 posições), tipo, referência opcional e valor.
const EVENTO = /(\d{5}) (.{17}) (DIAS |HORAS|VALOR|BASE |INFOR)\s+(?:([\d.]+,\d{2})\s+)?([\d.]+,\d{2})/g;
const RESUMO_EVENTO = /(\d{5}) (.{17})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/g;

export function parseNumeroBr(valor: string): number {
  return Number(valor.replace(/\./g, "").replace(",", "."));
}

function colunaPorPosicao(posicao: number): ColunaEvento {
  // Cada coluna tem ~52 caracteres; "| " ocupa as 2 primeiras posições da linha.
  if (posicao < 52) return "provento";
  if (posicao < 104) return "desconto";
  return "base";
}

export function parseFolhaPagamento(conteudo: string): FolhaPagamentoParseResult {
  const linhas = conteudo.split(/\r?\n/);

  let empresa: { codigo: string; nome: string } | null = null;
  let competencia: string | null = null;
  const funcionarios: FuncionarioFolha[] = [];
  const resumoPorEvento: Record<string, number> = {};
  let atual: FuncionarioFolha | null = null;
  let noResumo = false;

  for (const linha of linhas) {
    if (!empresa) {
      const m = EMPRESA.exec(linha);
      if (m) empresa = { codigo: m[1], nome: m[2].trim() };
    }
    if (!competencia) {
      const m = COMPETENCIA.exec(linha);
      if (m) competencia = `${m[1]}/${m[2]}`;
    }

    if (/RESUMO POR EVENTO|EVENTO\s+REFERENCIA\s+VALOR/.test(linha)) {
      noResumo = true;
      atual = null;
      continue;
    }

    if (noResumo) {
      for (const m of linha.matchAll(RESUMO_EVENTO)) {
        resumoPorEvento[m[1]] = (resumoPorEvento[m[1]] ?? 0) + parseNumeroBr(m[4]);
      }
      continue;
    }

    const func = FUNCIONARIO.exec(linha);
    if (func) {
      const matricula = func[1];
      if (func[3] === undefined) {
        // "*** CONTINUAÇÃO ***" no topo de uma página nova — segue no mesmo funcionário.
        if (!atual || atual.matricula !== matricula) {
          atual = funcionarios.find((f) => f.matricula === matricula) ?? null;
        }
        continue;
      }
      atual = {
        matricula,
        nome: func[2].trim(),
        funcao: func[3].trim().replace(/\s+/g, " "),
        situacao: func[4].trim(),
        divisao: "",
        salarioBase: 0,
        admissao: "",
        gozoInicio: null,
        gozoFim: null,
        eventos: [],
      };
      funcionarios.push(atual);
      continue;
    }

    if (!atual) continue;

    const div = DIVISAO.exec(linha);
    if (div) {
      atual.divisao = div[1];
      atual.salarioBase = parseNumeroBr(div[2]);
      atual.admissao = div[3];
      atual.gozoInicio = div[4] ?? null;
      atual.gozoFim = div[5] ?? null;
      continue;
    }

    for (const m of linha.matchAll(EVENTO)) {
      atual.eventos.push({
        codigo: m[1],
        descricao: m[2].trim(),
        coluna: colunaPorPosicao(m.index ?? 0),
        tipo: m[3].trim(),
        referencia: m[4] ? parseNumeroBr(m[4]) : null,
        valor: parseNumeroBr(m[5]),
      });
    }
  }

  if (!empresa) throw new Error("Não encontrei o cabeçalho da empresa no arquivo. Formato inesperado.");
  if (!competencia) throw new Error("Não encontrei a competência (mês/ano) no arquivo.");
  if (funcionarios.length === 0) throw new Error("Nenhum funcionário foi reconhecido no arquivo.");

  // Conferência da leitura: a soma de cada evento tem que bater com o resumo da última página.
  if (Object.keys(resumoPorEvento).length > 0) {
    const somaLida: Record<string, number> = {};
    for (const f of funcionarios) {
      for (const e of f.eventos) somaLida[e.codigo] = (somaLida[e.codigo] ?? 0) + e.valor;
    }
    const divergentes = Object.entries(resumoPorEvento)
      .filter(([codigo, total]) => Math.abs((somaLida[codigo] ?? 0) - total) > 0.05)
      .map(([codigo]) => codigo);
    if (divergentes.length > 0) {
      throw new Error(
        `A leitura do arquivo não bate com o resumo da última página nos eventos ${divergentes.join(", ")}. O formato do relatório pode ter mudado.`
      );
    }
  }

  return { empresa, competencia, funcionarios, resumoPorEvento };
}
