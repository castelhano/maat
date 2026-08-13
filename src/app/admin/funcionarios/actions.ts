"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { logAction } from "@/lib/audit";

const funcionarioSchema = z
  .object({
    empresaId: z.string().min(1, "Selecione a empresa"),
    cargoId: z.string().min(1, "Selecione o cargo"),
    matricula: z.string().min(1, "Informe a matrícula"),
    nome: z.string().min(1, "Informe o nome"),
    dataAdmissao: z.string().min(1, "Informe a data de admissão"),
    salario: z.coerce.number().positive("Informe um salário válido"),
    status: z.enum(["ativo", "afastado", "desligado"]),
    dataAfastamento: z.string().nullable().optional(),
    dataDesligamento: z.string().nullable().optional(),
    recebeCestaBasica: z.boolean().nullable(),
    recebeValeRefeicao: z.boolean().nullable(),
    valorValeRefeicao: z.coerce.number().nonnegative().nullable().optional(),
    temGratificacao: z.boolean(),
    recebeCestaComoVR: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "afastado" && !data.dataAfastamento) {
      ctx.addIssue({
        code: "custom",
        path: ["dataAfastamento"],
        message: "Informe a data de afastamento",
      });
    }
    if (data.status === "desligado" && !data.dataDesligamento) {
      ctx.addIssue({
        code: "custom",
        path: ["dataDesligamento"],
        message: "Informe a data de desligamento",
      });
    }
  });

type FuncionarioInput = z.infer<typeof funcionarioSchema>;

function montarDados(data: FuncionarioInput) {
  return {
    empresaId: data.empresaId,
    cargoId: data.cargoId,
    matricula: data.matricula,
    nome: data.nome,
    dataAdmissao: new Date(data.dataAdmissao),
    salario: data.salario,
    status: data.status,
    dataAfastamento: data.status === "afastado" && data.dataAfastamento ? new Date(data.dataAfastamento) : null,
    dataDesligamento: data.status === "desligado" && data.dataDesligamento ? new Date(data.dataDesligamento) : null,
    recebeCestaBasica: data.recebeCestaBasica,
    recebeValeRefeicao: data.recebeValeRefeicao,
    valorValeRefeicao: data.valorValeRefeicao ?? null,
    temGratificacao: data.temGratificacao,
    recebeCestaComoVR: data.recebeCestaComoVR,
  };
}

export async function createFuncionario(input: FuncionarioInput) {
  const admin = await requireAdmin();
  const data = funcionarioSchema.parse(input);

  const existente = await prisma.funcionario.findUnique({
    where: { empresaId_matricula: { empresaId: data.empresaId, matricula: data.matricula } },
  });
  if (existente) {
    return { error: "Já existe um funcionário com essa matrícula nessa empresa." };
  }

  const funcionario = await prisma.funcionario.create({ data: montarDados(data) });
  await logAction(admin.id, "funcionario.create", funcionario.id, { matricula: data.matricula, nome: data.nome });

  revalidatePath("/admin/funcionarios");
  return { error: null };
}

export async function updateFuncionario(id: string, input: FuncionarioInput) {
  const admin = await requireAdmin();
  const data = funcionarioSchema.parse(input);

  const conflito = await prisma.funcionario.findFirst({
    where: { empresaId: data.empresaId, matricula: data.matricula, NOT: { id } },
  });
  if (conflito) {
    return { error: "Já existe outro funcionário com essa matrícula nessa empresa." };
  }

  await prisma.funcionario.update({ where: { id }, data: montarDados(data) });
  await logAction(admin.id, "funcionario.update", id, { matricula: data.matricula, nome: data.nome });

  revalidatePath("/admin/funcionarios");
  return { error: null };
}

export async function deleteFuncionario(id: string) {
  const admin = await requireAdmin();

  await prisma.funcionario.delete({ where: { id } });
  await logAction(admin.id, "funcionario.delete", id);

  revalidatePath("/admin/funcionarios");
  return { error: null };
}
