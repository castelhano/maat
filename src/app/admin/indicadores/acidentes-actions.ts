"use server";

import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";

export type OpcaoEmpresaCat = { id: string; nome: string };

export async function listarEmpresasComCat(): Promise<OpcaoEmpresaCat[]> {
  await requirePermissao("indicadores", "consultar");
  const empresas = await prisma.empresa.findMany({
    where: { funcionarios: { some: { cats: { some: {} } } } },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  return empresas;
}

export type AcidenteLinha = {
  id: string;
  dataAcidente: string; // ISO
  // "1" = Típico, "2" = Doença ocupacional, "3" = Trajeto — conforme o sistema de origem do CAT.
  tipoAcidente: string;
  funcionarioNome: string;
  cargoNome: string;
};

export async function carregarAcidentes(filtro: {
  empresaId?: string;
  setor?: string;
}): Promise<{ linhas: AcidenteLinha[] }> {
  await requirePermissao("indicadores", "consultar");

  const registros = await prisma.cat.findMany({
    where: {
      funcionario: {
        ...(filtro.empresaId ? { empresaId: filtro.empresaId } : {}),
        ...(filtro.setor ? { cargo: { setor: filtro.setor } } : {}),
      },
    },
    include: { funcionario: { include: { cargo: true } } },
    orderBy: { dataAcidente: "asc" },
  });

  return {
    linhas: registros.map((r) => ({
      id: r.id,
      dataAcidente: r.dataAcidente.toISOString(),
      tipoAcidente: r.tipoAcidente,
      funcionarioNome: r.funcionario.nome,
      cargoNome: r.funcionario.cargo.nome,
    })),
  };
}
