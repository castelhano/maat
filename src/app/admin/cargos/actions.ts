"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { logAction } from "@/lib/audit";

const cargoSchema = z.object({
  nome: z.string().min(1, "Informe o nome do cargo"),
  recebeCestaBasica: z.boolean(),
  recebeValeRefeicao: z.boolean(),
  departamento: z.string().nullable(),
  setor: z.string().nullable(),
});

export async function createCargo(input: z.infer<typeof cargoSchema>) {
  const admin = await requireAdmin();
  const data = cargoSchema.parse(input);

  const existente = await prisma.cargo.findUnique({ where: { nome: data.nome } });
  if (existente) {
    return { error: "Já existe um cargo com esse nome." };
  }

  const cargo = await prisma.cargo.create({ data });
  await logAction(admin.id, "cargo.create", cargo.id, data);

  revalidatePath("/admin/cargos");
  return { error: null };
}

export async function updateCargo(id: string, input: z.infer<typeof cargoSchema>) {
  const admin = await requireAdmin();
  const data = cargoSchema.parse(input);

  const conflito = await prisma.cargo.findFirst({ where: { nome: data.nome, NOT: { id } } });
  if (conflito) {
    return { error: "Já existe outro cargo com esse nome." };
  }

  await prisma.cargo.update({ where: { id }, data });
  await logAction(admin.id, "cargo.update", id, data);

  revalidatePath("/admin/cargos");
  return { error: null };
}

export async function deleteCargo(id: string) {
  const admin = await requireAdmin();

  const funcionarios = await prisma.funcionario.count({ where: { cargoId: id } });
  if (funcionarios > 0) {
    return {
      error: `Esse cargo tem ${funcionarios} funcionário(s) vinculado(s). Mude o cargo deles antes de excluir.`,
    };
  }

  await prisma.cargo.delete({ where: { id } });
  await logAction(admin.id, "cargo.delete", id);

  revalidatePath("/admin/cargos");
  return { error: null };
}
