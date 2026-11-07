"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { MSG_EMPRESA_NAO_LIBERADA, podeEmpresa, requirePermissao } from "@/lib/session";
import { logAction } from "@/lib/audit";

const terceiroSchema = z.object({
  empresaId: z.string().min(1, "Selecione a empresa"),
  nome: z.string().min(1, "Informe o nome"),
  documento: z.string().nullable().optional(),
  ativo: z.boolean(),
  recebeCestaBasica: z.boolean(),
  recebeValeRefeicao: z.boolean(),
  valorValeRefeicao: z.coerce.number().nonnegative().nullable().optional(),
  recebeCestaComoVR: z.boolean(),
  recebeValeGas: z.boolean().nullable(),
  valeGasPecunia: z.boolean(),
});

type TerceiroInput = z.infer<typeof terceiroSchema>;

async function podeTerceiro(user: { id: string; role: string }, id: string) {
  const atual = await prisma.terceiro.findUnique({ where: { id }, select: { empresaId: true } });
  return !!atual && (await podeEmpresa(user, atual.empresaId));
}

function montarDados(data: TerceiroInput) {
  return {
    empresaId: data.empresaId,
    nome: data.nome,
    documento: data.documento || null,
    ativo: data.ativo,
    recebeCestaBasica: data.recebeCestaBasica,
    recebeValeRefeicao: data.recebeValeRefeicao,
    valorValeRefeicao: data.valorValeRefeicao ?? null,
    recebeCestaComoVR: data.recebeCestaComoVR,
    recebeValeGas: data.recebeValeGas,
    valeGasPecunia: data.valeGasPecunia,
  };
}

export async function createTerceiro(input: TerceiroInput) {
  const admin = await requirePermissao("terceiros", "operar");
  const data = terceiroSchema.parse(input);
  if (!(await podeEmpresa(admin, data.empresaId))) return { error: MSG_EMPRESA_NAO_LIBERADA };

  const terceiro = await prisma.terceiro.create({ data: montarDados(data) });
  await logAction(admin.id, "terceiro.create", terceiro.id, { nome: data.nome });

  revalidatePath("/admin/terceiros");
  return { error: null };
}

export async function updateTerceiro(id: string, input: TerceiroInput) {
  const admin = await requirePermissao("terceiros", "operar");
  const data = terceiroSchema.parse(input);
  if (!(await podeTerceiro(admin, id)) || !(await podeEmpresa(admin, data.empresaId))) {
    return { error: MSG_EMPRESA_NAO_LIBERADA };
  }

  await prisma.terceiro.update({ where: { id }, data: montarDados(data) });
  await logAction(admin.id, "terceiro.update", id, { nome: data.nome });

  revalidatePath("/admin/terceiros");
  return { error: null };
}

export async function deleteTerceiro(id: string) {
  const admin = await requirePermissao("terceiros", "operar");
  if (!(await podeTerceiro(admin, id))) return { error: MSG_EMPRESA_NAO_LIBERADA };

  await prisma.terceiro.delete({ where: { id } });
  await logAction(admin.id, "terceiro.delete", id);

  revalidatePath("/admin/terceiros");
  return { error: null };
}
