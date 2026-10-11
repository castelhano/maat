// Cadastro de funcionários (Folha > Relatórios > Listagem Genérica > 992) — TXT de largura fixa,
// uma empresa por arquivo, uma linha por funcionário com código da empresa, matrícula, nome
// completo, CPF, telefone, admissão, função, salário base, situação (A/F/D) e vale-refeição (S/N).
// Substitui a antiga folha de salários + situação/VR. Algumas variantes trazem ainda data e motivo
// de desligamento no fim da linha — aceitos e ignorados quando ausentes.
//
// Os campos de texto à esquerda (nome, CPF, telefone — que podem vir vazios) são lidos pela posição
// das colunas no cabeçalho; o resto da linha (a partir da admissão) por formato, porque salários
// acima de 10 mil empurram as colunas da direita uma posição.

export type CadastroSituacao = "ativo" | "afastado" | "desligado";

export type CadastroLinha = {
  matricula: string;
  nomeCompleto: string;
  cpf: string | null;
  telefone: string | null;
  dataAdmissao: Date;
  funcao: string;
  salario: number;
  status: CadastroSituacao;
  recebeValeRefeicao: boolean;
  dataDesligamento: Date | null;
  motivoDesligamento: string | null;
};

export type CadastroParseResult = {
  empresa: { codigo: string; nome: string };
  linhas: CadastroLinha[];
};

const STATUS_MAP: Record<string, CadastroSituacao> = { A: "ativo", F: "afastado", D: "desligado" };

const CAUDA =
  /^(\d{2})\/(\d{2})\/(\d{4})\s(.+?)\s+([\d.]+,\d{2})\s+([AFD])\s+([SN])(?:\s+(\d{2})\/(\d{2})\/(\d{4}))?(?:\s+(.*))?$/;

function data(dia: string, mes: string, ano: string): Date {
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

function valor(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", "."));
}

function limpar(texto: string): string {
  return texto.trim().replace(/\s+/g, " ");
}

export function parseCadastro(conteudo: string): CadastroParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/);

  const cabecalho = linhasArquivo.find((l) => l.includes("CODFUNC") && l.includes("DTADMFUNC"));
  if (!cabecalho) {
    throw new Error(
      "Não reconheci o cabeçalho do relatório de cadastro (Listagem Genérica 992) — confira se é o arquivo certo."
    );
  }
  const pos = {
    fantasia: cabecalho.indexOf("NOMEFANTASIAEMPRESA"),
    codfunc: cabecalho.indexOf("CODFUNC"),
    nome: cabecalho.indexOf("NOMECOMPLETOFUNC"),
    cpf: cabecalho.indexOf("CPFNUMERO"),
    fone: cabecalho.indexOf("FONEFUNC"),
    admissao: cabecalho.indexOf("DTADMFUNC"),
  };
  if (Object.values(pos).some((p) => p === -1)) {
    throw new Error(
      "O cabeçalho do relatório não tem todas as colunas esperadas (código da empresa, matrícula, nome completo, CPF, telefone, admissão)."
    );
  }

  let empresa: { codigo: string; nome: string } | null = null;
  const porMatricula = new Map<string, CadastroLinha>();

  for (const linha of linhasArquivo) {
    if (linha.length <= pos.fone) continue;
    const codigoEmpresa = linha.slice(0, pos.fantasia).trim();
    const matricula = linha.slice(pos.codfunc, pos.nome).trim();
    if (!/^\d+$/.test(codigoEmpresa) || !/^\d{6}$/.test(matricula)) continue;

    // A data de admissão começa uma posição antes do rótulo DTADMFUNC — localiza pelo formato a
    // partir do telefone (que nunca tem "/").
    const aposFone = linha.slice(pos.fone);
    const inicioAdmissao = aposFone.search(/\d{2}\/\d{2}\/\d{4}\s/);
    const cauda = inicioAdmissao === -1 ? null : CAUDA.exec(aposFone.slice(inicioAdmissao).trimEnd());
    if (!cauda) {
      throw new Error(`Matrícula ${matricula}: não consegui ler admissão, função, salário, situação e VR da linha.`);
    }
    const [, dAdm, mAdm, aAdm, funcao, salarioStr, sit, vr, dDes, mDes, aDes, motivo] = cauda;

    const codigo = codigoEmpresa.padStart(3, "0");
    if (!empresa) {
      empresa = { codigo, nome: limpar(linha.slice(pos.fantasia, pos.codfunc)) };
    } else if (empresa.codigo !== codigo) {
      throw new Error(
        `O arquivo tem mais de uma empresa (${empresa.codigo} e ${codigo}) — gere um arquivo por empresa.`
      );
    }

    const cpf = linha.slice(pos.cpf, pos.fone).replace(/\D/g, "");
    const telefone = limpar(aposFone.slice(0, inicioAdmissao));

    // Linha repetida da mesma matrícula (ex.: dois registros de rescisão no ERP) — fica a última.
    porMatricula.set(matricula, {
      matricula,
      nomeCompleto: limpar(linha.slice(pos.nome, pos.cpf)),
      cpf: cpf || null,
      telefone: telefone || null,
      dataAdmissao: data(dAdm, mAdm, aAdm),
      funcao: limpar(funcao),
      salario: valor(salarioStr),
      status: STATUS_MAP[sit],
      recebeValeRefeicao: vr === "S",
      dataDesligamento: dDes ? data(dDes, mDes, aDes) : null,
      motivoDesligamento: motivo && !/^0?$/.test(motivo.trim()) ? limpar(motivo) : null,
    });
  }

  if (!empresa || porMatricula.size === 0) {
    throw new Error("Nenhuma linha de funcionário foi reconhecida no arquivo.");
  }

  return { empresa, linhas: [...porMatricula.values()] };
}
