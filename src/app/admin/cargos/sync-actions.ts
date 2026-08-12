"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { logAction } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { parseRelacaoFuncionarios, type RelacaoFuncionariosLinha } from "@/lib/parsers/relacao-funcionarios";

export type PreviewAtualizacaoCargo = {
  cargoId: string;
  nome: string;
  departamentoAtual: string | null;
  departamentoNovo: string;
  setorAtual: string | null;
  setorNovo: string;
};

export type PreviewCargoNovo = {
  nome: string;
  departamento: string;
  setor: string;
};

export type PreviewSyncDepartamentoResult = {
  atualizados: PreviewAtualizacaoCargo[];
  novos: PreviewCargoNovo[];
  semMudanca: number;
};

async function montarDiff(linhas: RelacaoFuncionariosLinha[]) {
  const cargos = await prisma.cargo.findMany();
  const cargoPorNome = new Map(cargos.map((c) => [c.nome, c]));

  const atualizados: PreviewAtualizacaoCargo[] = [];
  const novos: PreviewCargoNovo[] = [];
  let semMudanca = 0;

  for (const linha of linhas) {
    const cargo = cargoPorNome.get(linha.funcao);
    if (!cargo) {
      novos.push({ nome: linha.funcao, departamento: linha.departamento, setor: linha.setor });
      continue;
    }
    if (cargo.departamento === linha.departamento && cargo.setor === linha.setor) {
      semMudanca++;
      continue;
    }
    atualizados.push({
      cargoId: cargo.id,
      nome: cargo.nome,
      departamentoAtual: cargo.departamento,
      departamentoNovo: linha.departamento,
      setorAtual: cargo.setor,
      setorNovo: linha.setor,
    });
  }

  return { atualizados, novos, semMudanca };
}

export async function previewSyncDepartamento(
  conteudo: string
): Promise<{ data: PreviewSyncDepartamentoResult | null; error: string | null }> {
  await requireAdmin();

  let parsed;
  try {
    parsed = parseRelacaoFuncionarios(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  return {
    data: {
      atualizados: diff.atualizados,
      novos: diff.novos,
      semMudanca: diff.semMudanca,
    },
    error: null,
  };
}

export async function confirmarSyncDepartamento(
  conteudo: string
): Promise<{ error: string | null; resumo?: { atualizados: number; criados: number } }> {
  const admin = await requireAdmin();

  let parsed;
  try {
    parsed = parseRelacaoFuncionarios(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  await prisma.$transaction(async (tx) => {
    for (const item of diff.atualizados) {
      await tx.cargo.update({
        where: { id: item.cargoId },
        data: { departamento: item.departamentoNovo, setor: item.setorNovo },
      });
    }
    for (const novo of diff.novos) {
      await tx.cargo.create({
        data: { nome: novo.nome, departamento: novo.departamento, setor: novo.setor },
      });
    }
  });

  await logAction(admin.id, "cargo.sync_departamento", undefined, {
    atualizados: diff.atualizados.length,
    criados: diff.novos.length,
  });

  revalidatePath("/admin/cargos");
  return { error: null, resumo: { atualizados: diff.atualizados.length, criados: diff.novos.length } };
}
