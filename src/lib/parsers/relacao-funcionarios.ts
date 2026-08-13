// Relatório "Relação Funcionários" do ERP (Folha > Relatórios > Listagem Auxiliares
// Funcionários > Relação Funcionários). Usado só pra sincronizar departamento/setor do CARGO —
// cargo é registro único global, não deve existir um cargo com departamento/setor divergente.

export type RelacaoFuncionariosLinha = {
  funcao: string;
  departamento: string;
  setor: string;
};

export type RelacaoFuncionariosParseResult = {
  linhas: RelacaoFuncionariosLinha[];
};

const LINHA_DADOS = /^\s*(\d{6})\s(.*)$/;
const DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const APOS_DATA = /^\s*([AF])\s+(.+?)\s{2,}(.+?)\s{2,}([\d.]+,\d{2})\s*$/;

export function parseRelacaoFuncionarios(conteudo: string): RelacaoFuncionariosParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  const linhas: RelacaoFuncionariosLinha[] = [];

  for (const linha of linhasArquivo) {
    const dadosMatch = LINHA_DADOS.exec(linha);
    if (!dadosMatch) continue;

    const matricula = dadosMatch[1];
    const resto = dadosMatch[2];

    const dataMatch = DATA.exec(resto);
    if (!dataMatch) continue;

    const antesData = resto.slice(0, dataMatch.index).trim();
    // Separa pela PRIMEIRA quebra de 2+ espaços (fim do nome). A função em si pode ter uma
    // quebra dupla interna (padding de coluna fixa antes de sufixo curto, ex. "INSP TRAFEGO  A"),
    // por isso não dá pra usar o último pedaço — colapsamos os espaços internos remanescentes.
    const fimNome = antesData.search(/\s{2,}/);
    if (fimNome === -1) {
      throw new Error(`Matrícula ${matricula}: não consegui separar nome e função na linha.`);
    }
    const funcao = antesData.slice(fimNome).trim().replace(/\s{2,}/g, " ");

    const depoisData = resto.slice(dataMatch.index + dataMatch[0].length);
    const apiMatch = APOS_DATA.exec(depoisData);
    if (!apiMatch) {
      throw new Error(`Matrícula ${matricula}: não encontrei área/departamento/salário na linha.`);
    }
    // Colunas do relatório: DESCAREA (área/setor amplo, ex. "MANUTENCAO") vem antes de
    // DESCDEPTO (departamento específico, ex. "BORRACHARIA") — nessa ordem no arquivo.
    const [, , setor, departamento] = apiMatch;

    linhas.push({ funcao, departamento: departamento.trim(), setor: setor.trim() });
  }

  if (linhas.length === 0) {
    throw new Error("Nenhuma linha de funcionário foi reconhecida no arquivo.");
  }

  const porFuncao = new Map<string, { departamento: string; setor: string }>();
  const inconsistentes = new Set<string>();
  for (const l of linhas) {
    const existente = porFuncao.get(l.funcao);
    if (!existente) {
      porFuncao.set(l.funcao, { departamento: l.departamento, setor: l.setor });
    } else if (existente.departamento !== l.departamento || existente.setor !== l.setor) {
      inconsistentes.add(l.funcao);
    }
  }
  if (inconsistentes.size > 0) {
    throw new Error(
      `Área/departamento vieram inconsistentes para a(s) função(ões): ${[...inconsistentes].join(
        ", "
      )} — funcionários da mesma função com valores diferentes. Confira o arquivo antes de importar.`
    );
  }

  const linhasUnicas = [...porFuncao.entries()].map(([funcao, v]) => ({ funcao, ...v }));

  return { linhas: linhasUnicas };
}
