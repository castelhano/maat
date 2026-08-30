// Sincroniza campos de funcionários JÁ CADASTRADOS (não cria ninguém — cadastro é papel do
// sync de folha em /admin/importar-folha, cujo arquivo tem a empresa): status (A/F/D), CPF,
// telefone, nome completo, e a elegibilidade de vale-refeição da função (coluna VALEREFEICFUNC,
// atributo do cargo, não do indivíduo). O arquivo não traz código de empresa nem competência —
// casa por matrícula.

export type SituacaoStatus = "ativo" | "afastado" | "desligado";

export type SituacaoValeRefeicaoLinha = {
  matricula: string;
  nomeCompleto: string;
  cpf: string;
  telefone: string | null;
  status: SituacaoStatus;
  funcao: string;
  recebeValeRefeicao: boolean;
};

export type SituacaoValeRefeicaoParseResult = {
  linhas: SituacaoValeRefeicaoLinha[];
};

const LINHA_DADOS = /^\s*(\d{6})\s+([AFD])\s+(\d{11})\s+(.+?)\s+([SN])\s+(.+)$/;
const LINHA_TOTAL = /^\s*(\d+)\s*$/;
// Nome e telefone vêm colados no resto da linha, separados só por espaços de preenchimento de
// largura fixa; o telefone (quando existe) é sempre o último "bloco" após o maior espaçamento.
const NOME_TELEFONE = /^(.*\S)\s{2,}(\S.*)$/;

const STATUS_MAP: Record<string, SituacaoStatus> = { A: "ativo", F: "afastado", D: "desligado" };

export function parseSituacaoValeRefeicao(conteudo: string): SituacaoValeRefeicaoParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  const linhas: SituacaoValeRefeicaoLinha[] = [];
  let totalRodape: number | null = null;

  for (const linha of linhasArquivo) {
    const dadosMatch = LINHA_DADOS.exec(linha);
    if (dadosMatch) {
      const [, matricula, situacao, cpf, funcao, valeRefeicao, resto] = dadosMatch;
      const nomeTelefoneMatch = NOME_TELEFONE.exec(resto);
      linhas.push({
        matricula,
        nomeCompleto: (nomeTelefoneMatch ? nomeTelefoneMatch[1] : resto).trim().replace(/\s+/g, " "),
        cpf,
        telefone: nomeTelefoneMatch ? nomeTelefoneMatch[2].trim() : null,
        status: STATUS_MAP[situacao],
        funcao: funcao.trim().replace(/\s+/g, " "),
        recebeValeRefeicao: valeRefeicao === "S",
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
