"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export type StatusImportacaoTipo = {
  empresasImportadas: { id: string; nome: string; importadoEm: string }[];
};

export type StatusImportacoes = Record<string, StatusImportacaoTipo>;

export async function statusImportacoes(competencia: string): Promise<StatusImportacoes> {
  await requireAdmin();
  if (!competencia.trim()) return {};

  const importacoes = await prisma.importacao.findMany({
    where: { competencia },
    include: { empresa: true },
    orderBy: { createdAt: "desc" },
  });

  const status: StatusImportacoes = {};
  const vistos = new Set<string>();
  for (const imp of importacoes) {
    const chave = `${imp.tipo}:${imp.empresaId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    if (!status[imp.tipo]) status[imp.tipo] = { empresasImportadas: [] };
    status[imp.tipo].empresasImportadas.push({
      id: imp.empresaId,
      nome: imp.empresa.nome,
      importadoEm: imp.createdAt.toISOString(),
    });
  }

  return status;
}
