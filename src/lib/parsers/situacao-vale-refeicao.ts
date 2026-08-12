// Sincroniza dois campos de funcionários JÁ CADASTRADOS (não cria ninguém — cadastro é papel do
// sync de folha em /admin/importar-folha, cujo arquivo tem a empresa): status (A/F/D) e a
// elegibilidade de vale-refeição da função (coluna VALEREFEICFUNC, atributo do cargo, não do
// indivíduo). O arquivo não traz código de empresa nem competência — casa por matrícula.

export type SituacaoStatus = "ativo" | "afastado" | "desligado";

export type SituacaoValeRefeicaoLinha = {
  matricula: string;
  nome: string;
  status: SituacaoStatus;
  dataAdmissao: Date;
  funcao: string;
  recebeValeRefeicao: boolean;
  salario: number;
};

export type SituacaoValeRefeicaoParseResult = {
  linhas: SituacaoValeRefeicaoLinha[];
};

const LINHA_DADOS =
  /^\s*(\d{6})\s+(.+?)\s+([AFD])\s+(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+([SN])\s+([\d.]+,\d{2})\s*$/;
const LINHA_TOTAL = /^\s*(\d+)\s*$/;

const STATUS_MAP: Record<string, SituacaoStatus> = { A: "ativo", F: "afastado", D: "desligado" };

function parseValorMonetario(valor: string): number {
  return Number(valor.replace(/\./g, "").replace(",", "."));
}

export function parseSituacaoValeRefeicao(conteudo: string): SituacaoValeRefeicaoParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  const linhas: SituacaoValeRefeicaoLinha[] = [];
  let totalRodape: number | null = null;

  for (const linha of linhasArquivo) {
    const dadosMatch = LINHA_DADOS.exec(linha);
    if (dadosMatch) {
      const [, matricula, nome, situacao, dia, mes, ano, funcao, valeRefeicao, salario] = dadosMatch;
      linhas.push({
        matricula,
        nome: nome.trim().replace(/\s+/g, " "),
        status: STATUS_MAP[situacao],
        dataAdmissao: new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia))),
        funcao: funcao.trim().replace(/\s+/g, " "),
        recebeValeRefeicao: valeRefeicao === "S",
        salario: parseValorMonetario(salario),
      });
      continue;
    }

    // O rodapé é só um número (total de funcionários) numa linha isolada; a última
    // ocorrência desse padrão no arquivo é a que vale, o resto é cabeçalho/espaço em branco.
    const totalMatch = LINHA_TOTAL.exec(linha);
    if (totalMatch) totalRodape = Number(totalMatch[1]);
  }

  if (linhas.length === 0) {
    throw new Error("Nenhuma linha de funcionário foi reconhecida no arquivo.");
  }
  if (totalRodape !== null && totalRodape !== linhas.length) {
    throw new Error(
      `Divergência na conferência: o arquivo informa ${totalRodape} funcionário(s) no rodapé, mas eu reconheci ${linhas.length} linha(s). O parser pode ter pulado ou mal-interpretado alguma linha.`
    );
  }

  const funcoesInconsistentes = new Set<string>();
  const valeRefeicaoPorFuncao = new Map<string, boolean>();
  for (const l of linhas) {
    const existente = valeRefeicaoPorFuncao.get(l.funcao);
    if (existente === undefined) {
      valeRefeicaoPorFuncao.set(l.funcao, l.recebeValeRefeicao);
    } else if (existente !== l.recebeValeRefeicao) {
      funcoesInconsistentes.add(l.funcao);
    }
  }
  if (funcoesInconsistentes.size > 0) {
    throw new Error(
      `A coluna de vale-refeição veio inconsistente para a(s) função(ões): ${[...funcoesInconsistentes].join(
        ", "
      )} — funcionários da mesma função com valores S/N diferentes. Confira o arquivo antes de importar.`
    );
  }

  return { linhas };
}
