"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { primeiraPalavra } from "@/lib/utils";
import { parseCadastro, type CadastroLinha, type CadastroSituacao } from "@/lib/parsers/cadastro";

// Desligamentos anteriores a esta data são histórico (o relatório pode vir com tudo desde a
// abertura da empresa) — ignorados tanto na sincronização quanto na leitura do VR por função.
const INICIO_CONSIDERADO = new Date(Date.UTC(2026, 0, 1));
const STATUS_LABEL: Record<CadastroSituacao, string> = { ativo: "Ativo", afastado: "Afastado", desligado: "Desligado" };

export type PreviewCadastroNovo = { matricula: string; nome: string; funcao: string; salario: number; status: CadastroSituacao };
export type PreviewCadastroAtualizado = { matricula: string; nome: string; mudancas: string[] };
export type PreviewCadastroCargoVR = { nome: string; atual: boolean | null; novo: boolean };

export type PreviewCadastroResult = {
  empresa: { codigo: string; nome: string; novaEmpresa: boolean };
  totalLinhas: number;
  ignoradosHistorico: number;
  novos: PreviewCadastroNovo[];
  atualizados: PreviewCadastroAtualizado[];
  semMudanca: number;
  cargosVR: PreviewCadastroCargoVR[];
  // Ativos/afastados no sistema que não vieram no arquivo — provavelmente desligados; quem marca
  // o desligamento é a importação de Afastados e Desligados, aqui só avisamos.
  ausentesNoArquivo: { matricula: string; nome: string; status: string }[];
};

function fmtData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

function mesmaData(a: Date | null, b: Date | null): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

function considerar(l: CadastroLinha): boolean {
  if (l.status !== "desligado") return true;
  return l.dataDesligamento !== null && l.dataDesligamento >= INICIO_CONSIDERADO;
}

// VR é atributo da função: tem que ser o mesmo pra todo mundo da função dentro do período
// considerado, senão a leitura é ambígua e a importação é bloqueada.
function vrPorFuncao(linhas: CadastroLinha[]): Map<string, boolean> {
  const mapa = new Map<string, boolean>();
  const inconsistentes = new Set<string>();
  for (const l of linhas) {
    const atual = mapa.get(l.funcao);
    if (atual === undefined) mapa.set(l.funcao, l.recebeValeRefeicao);
    else if (atual !== l.recebeValeRefeicao) inconsistentes.add(l.funcao);
  }
  if (inconsistentes.size > 0) {
    throw new Error(
      `Vale-refeição veio diferente (S e N) para a mesma função: ${[...inconsistentes].join(", ")}. Confira o arquivo antes de importar.`
    );
  }
  return mapa;
}

async function montarDiff(conteudo: string) {
  const parsed = parseCadastro(conteudo);
  const linhas = parsed.linhas.filter(considerar);
  const ignoradosHistorico = parsed.linhas.length - linhas.length;
  const vr = vrPorFuncao(linhas);

  const empresaExistente = await prisma.empresa.findUnique({ where: { codigo: parsed.empresa.codigo } });
  const funcionarios = empresaExistente
    ? await prisma.funcionario.findMany({ where: { empresaId: empresaExistente.id }, include: { cargo: true } })
    : [];
  const porMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));
  const cargos = await prisma.cargo.findMany();
  const cargoPorNome = new Map(cargos.map((c) => [c.nome, c]));

  const novos: PreviewCadastroNovo[] = [];
  const atualizados: PreviewCadastroAtualizado[] = [];
  let semMudanca = 0;

  for (const l of linhas) {
    const f = porMatricula.get(l.matricula);
    if (!f) {
      // Desligado que nunca esteve no sistema não precisa ser criado.
      if (l.status !== "desligado") {
        novos.push({ matricula: l.matricula, nome: l.nomeCompleto, funcao: l.funcao, salario: l.salario, status: l.status });
      }
      continue;
    }

    const mudancas: string[] = [];
    if (f.cargo.nome !== l.funcao) mudancas.push(`cargo: ${f.cargo.nome} → ${l.funcao}`);
    if (!f.salario.equals(l.salario)) mudancas.push(`salário: ${f.salario.toFixed(2)} → ${l.salario.toFixed(2)}`);
    if (!mesmaData(f.dataAdmissao, l.dataAdmissao)) {
      mudancas.push(`admissão: ${fmtData(f.dataAdmissao)} → ${fmtData(l.dataAdmissao)}`);
    }
    if (f.status !== l.status) {
      mudancas.push(`situação: ${STATUS_LABEL[f.status as CadastroSituacao] ?? f.status} → ${STATUS_LABEL[l.status]}`);
    }
    if (l.status === "desligado" && !mesmaData(f.dataDesligamento, l.dataDesligamento)) {
      mudancas.push(`desligamento: ${fmtData(f.dataDesligamento)} → ${fmtData(l.dataDesligamento)}`);
    }
    if ((f.cpf ?? "") !== (l.cpf ?? "") && l.cpf) mudancas.push(`CPF: ${f.cpf ?? "(vazio)"} → ${l.cpf}`);
    if ((f.telefone ?? "") !== (l.telefone ?? "") && l.telefone) {
      mudancas.push(`telefone: ${f.telefone ?? "(vazio)"} → ${l.telefone}`);
    }
    if ((f.nomeCompleto ?? "") !== l.nomeCompleto) {
      mudancas.push(`nome completo: ${f.nomeCompleto ?? "(vazio)"} → ${l.nomeCompleto}`);
    }

    if (mudancas.length > 0) atualizados.push({ matricula: l.matricula, nome: l.nomeCompleto, mudancas });
    else semMudanca++;
  }

  const cargosVR: PreviewCadastroCargoVR[] = [];
  for (const [nome, novo] of vr) {
    const cargo = cargoPorNome.get(nome);
    if (!cargo) cargosVR.push({ nome, atual: null, novo });
    else if (cargo.recebeValeRefeicao !== novo) cargosVR.push({ nome, atual: cargo.recebeValeRefeicao, novo });
  }

  const noArquivo = new Set(parsed.linhas.map((l) => l.matricula));
  const ausentesNoArquivo = funcionarios
    .filter((f) => f.status !== "desligado" && !noArquivo.has(f.matricula))
    .map((f) => ({ matricula: f.matricula, nome: f.nomeCompleto ?? f.nome, status: STATUS_LABEL[f.status as CadastroSituacao] ?? f.status }));

  return { parsed, linhas, ignoradosHistorico, vr, empresaExistente, novos, atualizados, semMudanca, cargosVR, ausentesNoArquivo };
}

export async function previewCadastro(
  conteudo: string
): Promise<{ data: PreviewCadastroResult | null; error: string | null }> {
  await requireAdmin();

  let diff;
  try {
    diff = await montarDiff(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  return {
    data: {
      empresa: { ...diff.parsed.empresa, novaEmpresa: !diff.empresaExistente },
      totalLinhas: diff.parsed.linhas.length,
      ignoradosHistorico: diff.ignoradosHistorico,
      novos: diff.novos,
      atualizados: diff.atualizados,
      semMudanca: diff.semMudanca,
      cargosVR: diff.cargosVR,
      ausentesNoArquivo: diff.ausentesNoArquivo,
    },
    error: null,
  };
}

export async function confirmarCadastro(
  conteudo: string,
  nomeArquivo: string,
  competencia: string
): Promise<{
  error: string | null;
  resumo?: { criados: number; atualizados: number };
}> {
  const admin = await requireAdmin();
  if (!competencia.trim()) return { error: "Selecione a competência antes de confirmar." };

  let diff;
  try {
    diff = await montarDiff(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }
  const { parsed, linhas, vr } = diff;

  const resumo = await prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.upsert({
      where: { codigo: parsed.empresa.codigo },
      create: { codigo: parsed.empresa.codigo, nome: parsed.empresa.nome, abbr: primeiraPalavra(parsed.empresa.nome) },
      update: {},
    });

    const cargoIdPorNome = new Map<string, string>();
    for (const [nome, recebeValeRefeicao] of vr) {
      const cargo = await tx.cargo.findFirst({ where: { nome } });
      const salvo = cargo
        ? cargo.recebeValeRefeicao === recebeValeRefeicao
          ? cargo
          : await tx.cargo.update({ where: { id: cargo.id }, data: { recebeValeRefeicao } })
        : await tx.cargo.create({ data: { nome, recebeValeRefeicao } });
      cargoIdPorNome.set(nome, salvo.id);
    }

    let criados = 0;
    let atualizados = 0;
    for (const l of linhas) {
      const cargoId = cargoIdPorNome.get(l.funcao)!;
      const existente = await tx.funcionario.findUnique({
        where: { empresaId_matricula: { empresaId: empresa.id, matricula: l.matricula } },
      });
      const dados = {
        cargoId,
        salario: l.salario,
        dataAdmissao: l.dataAdmissao,
        status: l.status,
        nomeCompleto: l.nomeCompleto,
        ...(l.cpf ? { cpf: l.cpf } : {}),
        ...(l.telefone ? { telefone: l.telefone } : {}),
        ...(l.status === "desligado"
          ? { dataDesligamento: l.dataDesligamento, ...(l.motivoDesligamento ? { motivoDesligamento: l.motivoDesligamento } : {}) }
          : {}),
      };

      if (existente) {
        await tx.funcionario.update({ where: { id: existente.id }, data: dados });
        atualizados++;
      } else if (l.status !== "desligado") {
        await tx.funcionario.create({
          data: { ...dados, empresaId: empresa.id, matricula: l.matricula, nome: l.nomeCompleto },
        });
        criados++;
      }
    }

    await tx.importacao.create({
      data: {
        empresaId: empresa.id,
        tipo: "cadastro",
        importadoPorId: admin.id,
        nomeArquivo,
        competencia,
        criados,
        atualizados,
        naoEncontrados: diff.ausentesNoArquivo.length > 0 ? JSON.stringify(diff.ausentesNoArquivo) : null,
      },
    });

    return { criados, atualizados };
  });

  return { error: null, resumo };
}
