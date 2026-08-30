"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  parseSituacaoValeRefeicao,
  type SituacaoStatus,
  type SituacaoValeRefeicaoLinha,
} from "@/lib/parsers/situacao-vale-refeicao";

const STATUS_LABEL: Record<SituacaoStatus, string> = { ativo: "Ativo", afastado: "Afastado", desligado: "Desligado" };

export type PreviewAtualizacao = {
  matricula: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  mudancas: string[];
};

export type PreviewAmbiguo = {
  matricula: string;
  nome: string;
  empresasPossiveis: { id: string; nome: string }[];
};

export type PreviewCargoVR = {
  cargoId: string;
  nome: string;
  atual: boolean;
  novo: boolean;
};

export type PreviewSituacaoResult = {
  totalLinhas: number;
  atualizados: PreviewAtualizacao[];
  semMudanca: number;
  ambiguos: PreviewAmbiguo[];
  cargosVR: PreviewCargoVR[];
  funcoesNaoCadastradas: string[];
  naoEncontrados: { matricula: string; nome: string }[];
};

async function montarDiff(linhas: SituacaoValeRefeicaoLinha[]) {
  const matriculas = linhas.map((l) => l.matricula);
  const funcionarios = await prisma.funcionario.findMany({
    where: { matricula: { in: matriculas } },
    include: { empresa: true },
  });
  const porMatricula = new Map<string, typeof funcionarios>();
  for (const f of funcionarios) {
    const lista = porMatricula.get(f.matricula) ?? [];
    lista.push(f);
    porMatricula.set(f.matricula, lista);
  }

  const atualizados: PreviewAtualizacao[] = [];
  const ambiguos: PreviewAmbiguo[] = [];
  const naoEncontrados: { matricula: string; nome: string }[] = [];
  let semMudanca = 0;

  for (const linha of linhas) {
    const candidatos = porMatricula.get(linha.matricula) ?? [];
    if (candidatos.length === 0) {
      naoEncontrados.push({ matricula: linha.matricula, nome: linha.nomeCompleto });
      continue;
    }
    if (candidatos.length > 1) {
      ambiguos.push({
        matricula: linha.matricula,
        nome: linha.nomeCompleto,
        empresasPossiveis: candidatos.map((c) => ({ id: c.empresaId, nome: c.empresa.nome })),
      });
      continue;
    }

    const funcionario = candidatos[0];
    const mudancas: string[] = [];
    if (funcionario.status !== linha.status) {
      mudancas.push(`situação: ${STATUS_LABEL[funcionario.status as SituacaoStatus]} → ${STATUS_LABEL[linha.status]}`);
    }
    if ((funcionario.cpf ?? "") !== linha.cpf) {
      mudancas.push(`CPF: ${funcionario.cpf ?? "(vazio)"} → ${linha.cpf}`);
    }
    if ((funcionario.telefone ?? "") !== (linha.telefone ?? "")) {
      mudancas.push(`telefone: ${funcionario.telefone ?? "(vazio)"} → ${linha.telefone ?? "(vazio)"}`);
    }
    if ((funcionario.nomeCompleto ?? "") !== linha.nomeCompleto) {
      mudancas.push(`nome completo: ${funcionario.nomeCompleto ?? "(vazio)"} → ${linha.nomeCompleto}`);
    }
    if (mudancas.length > 0) {
      atualizados.push({
        matricula: linha.matricula,
        nome: linha.nomeCompleto,
        empresaId: funcionario.empresaId,
        empresaNome: funcionario.empresa.nome,
        mudancas,
      });
    } else {
      semMudanca++;
    }
  }

  const cargos = await prisma.cargo.findMany();
  const cargoPorNome = new Map(cargos.map((c) => [c.nome, c]));
  const valeRefeicaoPorFuncao = new Map<string, boolean>();
  for (const l of linhas) valeRefeicaoPorFuncao.set(l.funcao, l.recebeValeRefeicao);

  const cargosVR: PreviewCargoVR[] = [];
  const funcoesNaoCadastradas: string[] = [];
  for (const [funcao, novo] of valeRefeicaoPorFuncao) {
    const cargo = cargoPorNome.get(funcao);
    if (!cargo) {
      funcoesNaoCadastradas.push(funcao);
      continue;
    }
    if (cargo.recebeValeRefeicao !== novo) {
      cargosVR.push({ cargoId: cargo.id, nome: cargo.nome, atual: cargo.recebeValeRefeicao, novo });
    }
  }

  return { atualizados, ambiguos, naoEncontrados, semMudanca, cargosVR, funcoesNaoCadastradas };
}

export async function previewSituacaoVR(
  conteudo: string
): Promise<{ data: PreviewSituacaoResult | null; error: string | null }> {
  await requireAdmin();

  let parsed;
  try {
    parsed = parseSituacaoValeRefeicao(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  return {
    data: {
      totalLinhas: parsed.linhas.length,
      atualizados: diff.atualizados,
      semMudanca: diff.semMudanca,
      ambiguos: diff.ambiguos,
      cargosVR: diff.cargosVR,
      funcoesNaoCadastradas: diff.funcoesNaoCadastradas,
      naoEncontrados: diff.naoEncontrados,
    },
    error: null,
  };
}

export async function confirmarSituacaoVR(
  conteudo: string,
  nomeArquivo: string,
  competencia: string,
  resolucoesAmbiguas: Record<string, string>
): Promise<{ error: string | null; resumo?: { atualizados: number; naoEncontrados: number; ambiguosPendentes: number } }> {
  const admin = await requireAdmin();

  if (!competencia.trim()) {
    return { error: "Selecione a competência antes de confirmar." };
  }

  let parsed;
  try {
    parsed = parseSituacaoValeRefeicao(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  const ambiguosPendentes = diff.ambiguos.filter((a) => !resolucoesAmbiguas[a.matricula]);
  if (ambiguosPendentes.length > 0) {
    return {
      error: `${ambiguosPendentes.length} matrícula(s) ambígua(s) ainda sem empresa escolhida. Resolva antes de confirmar.`,
    };
  }

  const resumo = await prisma.$transaction(async (tx) => {
    let atualizadosCount = 0;
    const porEmpresa = new Map<string, number>();

    for (const item of diff.atualizados) {
      const linha = parsed.linhas.find((l) => l.matricula === item.matricula)!;
      await tx.funcionario.updateMany({
        where: { empresaId: item.empresaId, matricula: item.matricula },
        data: {
          status: linha.status,
          cpf: linha.cpf,
          telefone: linha.telefone,
          nomeCompleto: linha.nomeCompleto,
        },
      });
      atualizadosCount++;
      porEmpresa.set(item.empresaId, (porEmpresa.get(item.empresaId) ?? 0) + 1);
    }

    for (const ambiguo of diff.ambiguos) {
      const empresaId = resolucoesAmbiguas[ambiguo.matricula];
      const linha = parsed.linhas.find((l) => l.matricula === ambiguo.matricula)!;
      const funcionario = await tx.funcionario.findUnique({
        where: { empresaId_matricula: { empresaId, matricula: ambiguo.matricula } },
      });
      if (!funcionario) continue;
      await tx.funcionario.update({
        where: { id: funcionario.id },
        data: {
          status: linha.status,
          cpf: linha.cpf,
          telefone: linha.telefone,
          nomeCompleto: linha.nomeCompleto,
        },
      });
      atualizadosCount++;
      porEmpresa.set(empresaId, (porEmpresa.get(empresaId) ?? 0) + 1);
    }

    // Cargo é global — o vale-refeição por função não é escopado por empresa.
    for (const cargoVR of diff.cargosVR) {
      await tx.cargo.update({ where: { id: cargoVR.cargoId }, data: { recebeValeRefeicao: cargoVR.novo } });
    }

    for (const [empresaId, atualizados] of porEmpresa) {
      await tx.importacao.create({
        data: {
          empresaId,
          tipo: "situacao_vale_refeicao",
          importadoPorId: admin.id,
          nomeArquivo,
          competencia,
          criados: 0,
          atualizados,
          naoEncontrados: null,
        },
      });
    }

    return { atualizados: atualizadosCount, naoEncontrados: diff.naoEncontrados.length, ambiguosPendentes: 0 };
  });

  return { error: null, resumo };
}
