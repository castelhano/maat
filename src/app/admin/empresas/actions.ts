"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { logAction } from "@/lib/audit";
import { primeiraPalavra } from "@/lib/utils";

const empresaSchema = z.object({
  codigo: z.string().min(1, "Informe o código"),
  nome: z.string().min(1, "Informe o nome"),
  abbr: z.string().nullable().optional(),
  valorCestaBasica: z.number().nullable().optional(),
});

export async function createEmpresa(input: z.infer<typeof empresaSchema>) {
  const admin = await requireAdmin();
  const data = empresaSchema.parse(input);

  const existente = await prisma.empresa.findUnique({ where: { codigo: data.codigo } });
  if (existente) {
    return { error: "Já existe uma empresa com esse código." };
  }

  const empresa = await prisma.empresa.create({
    data: {
      codigo: data.codigo,
      nome: data.nome,
      abbr: data.abbr || primeiraPalavra(data.nome),
      valorCestaBasica: data.valorCestaBasica ?? null,
    },
  });
  await logAction(admin.id, "empresa.create", empresa.id, data);

  revalidatePath("/admin/empresas");
  return { error: null };
}

export async function updateEmpresa(id: string, input: z.infer<typeof empresaSchema>) {
  const admin = await requireAdmin();
  const data = empresaSchema.parse(input);

  const conflito = await prisma.empresa.findFirst({ where: { codigo: data.codigo, NOT: { id } } });
  if (conflito) {
    return { error: "Já existe outra empresa com esse código." };
  }

  await prisma.empresa.update({
    where: { id },
    data: {
      codigo: data.codigo,
      nome: data.nome,
      abbr: data.abbr || primeiraPalavra(data.nome),
      valorCestaBasica: data.valorCestaBasica ?? null,
    },
  });
  await logAction(admin.id, "empresa.update", id, data);

  revalidatePath("/admin/empresas");
  return { error: null };
}

export async function deleteEmpresa(id: string) {
  const admin = await requireAdmin();

  const funcionarios = await prisma.funcionario.count({ where: { empresaId: id } });
  if (funcionarios > 0) {
    return {
      error: `Essa empresa tem ${funcionarios} funcionário(s) vinculado(s). Remova-os antes de excluir a empresa.`,
    };
  }

  await prisma.empresa.delete({ where: { id } });
  await logAction(admin.id, "empresa.delete", id);

  revalidatePath("/admin/empresas");
  return { error: null };
}
