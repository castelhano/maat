"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { MSG_EMPRESA_NAO_LIBERADA, podeEmpresa, requirePermissao } from "@/lib/session";
import { logAction } from "@/lib/audit";
import { primeiraPalavra } from "@/lib/utils";

const empresaSchema = z.object({
  codigo: z.string().min(1, "Informe o código"),
  nome: z.string().min(1, "Informe o nome"),
  abbr: z.string().nullable().optional(),
  valorCestaBasica: z.number().nullable().optional(),
});

export async function createEmpresa(input: z.infer<typeof empresaSchema>) {
  const admin = await requirePermissao("empresas", "operar");
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
  // Usuário restrito que cadastra uma empresa passa a ter acesso a ela.
  if (admin.role !== "admin") {
    await prisma.userEmpresa.create({ data: { userId: admin.id, empresaId: empresa.id } });
  }
  await logAction(admin.id, "empresa.create", empresa.id, data);

  revalidatePath("/admin/empresas");
  return { error: null };
}

export async function updateEmpresa(id: string, input: z.infer<typeof empresaSchema>) {
  const admin = await requirePermissao("empresas", "operar");
  const data = empresaSchema.parse(input);
  if (!(await podeEmpresa(admin, id))) return { error: MSG_EMPRESA_NAO_LIBERADA };

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

// Regras por empresa (ver "Regras por empresa" em Empresa no schema). Os padrões são as regras das
// empresas originais; só a empresa que trabalha diferente (ex.: LOGTRANS) muda alguma coisa.
const regrasSchema = z.object({
  beneficioPeriodoDiaInicio: z.number().int().min(2).max(28).nullable(),
  faltasPerdeBeneficio: z.number().int().min(1).max(31),
  valeGasMensal: z.boolean(),
  valeGasRegraSuspensao: z.boolean(),
  vaRegra: z.enum(["percentual", "fixo"]),
  vaValorFixo: z.number().nonnegative().nullable(),
  vaValoresPorCargo: z.array(z.object({ cargo: z.string().trim().min(1).max(100), valor: z.number().nonnegative() })).max(50),
  vaDiaMantemDesligado: z.number().int().min(1).max(32),
  cestaDiaMantemDesligado: z.number().int().min(1).max(31).nullable(),
  cidades: z
    .array(
      z.object({
        codigo: z.string().trim().regex(/^\d{1,6}$/),
        nome: z.string().trim().min(1).max(60),
        valorValeGas: z.number().nonnegative().nullable(),
      })
    )
    .max(20),
  bancoHorasModo: z.enum(["calculado", "extrato"]),
  feriasCalendario: z.enum(["quinzena", "mensal"]),
});

export type RegrasEmpresaInput = z.infer<typeof regrasSchema>;

export async function salvarRegrasEmpresa(id: string, input: RegrasEmpresaInput) {
  const admin = await requirePermissao("empresas", "operar");
  const parsed = regrasSchema.safeParse(input);
  if (!parsed.success) return { error: "Confira os campos das regras — algum valor está fora do formato." };
  if (!(await podeEmpresa(admin, id))) return { error: MSG_EMPRESA_NAO_LIBERADA };
  const r = parsed.data;
  if (r.vaRegra === "fixo" && r.vaValorFixo === null) {
    return { error: "Com o VA de valor fixo, informe o valor fixo da empresa." };
  }

  await prisma.empresa.update({
    where: { id },
    data: {
      beneficioPeriodoDiaInicio: r.beneficioPeriodoDiaInicio,
      faltasPerdeBeneficio: r.faltasPerdeBeneficio,
      valeGasMensal: r.valeGasMensal,
      valeGasRegraSuspensao: r.valeGasRegraSuspensao,
      vaRegra: r.vaRegra,
      vaValorFixo: r.vaRegra === "fixo" ? r.vaValorFixo : null,
      vaValoresPorCargo: r.vaRegra === "fixo" && r.vaValoresPorCargo.length > 0 ? JSON.stringify(r.vaValoresPorCargo) : null,
      vaDiaMantemDesligado: r.vaDiaMantemDesligado,
      cestaDiaMantemDesligado: r.cestaDiaMantemDesligado,
      cidades: r.cidades.length > 0 ? JSON.stringify(r.cidades) : null,
      bancoHorasModo: r.bancoHorasModo,
      feriasCalendario: r.feriasCalendario,
    },
  });
  await logAction(admin.id, "empresa.regras", id, r);

  revalidatePath("/admin/empresas");
  return { error: null };
}

// Ajuste manual da cidade de um funcionário (empresas com cidades, ex.: LOGTRANS) — usado quando
// a Divisão do ERP está errada; a próxima folha só sobrescreve se trouxer um código de cidade
// cadastrado.
export async function salvarCidadeFuncionario(funcionarioId: string, cidade: string | null) {
  const admin = await requirePermissao("empresas", "operar");
  const funcionario = await prisma.funcionario.findUnique({ where: { id: funcionarioId }, select: { empresaId: true } });
  if (!funcionario) return { error: "Funcionário não encontrado." };
  if (!(await podeEmpresa(admin, funcionario.empresaId))) return { error: MSG_EMPRESA_NAO_LIBERADA };
  await prisma.funcionario.update({ where: { id: funcionarioId }, data: { cidade: cidade?.trim() || null } });
  await logAction(admin.id, "funcionario.cidade", funcionarioId, { cidade });
  revalidatePath("/admin/empresas");
  return { error: null };
}

export async function deleteEmpresa(id: string) {
  const admin = await requirePermissao("empresas", "operar");
  if (!(await podeEmpresa(admin, id))) return { error: MSG_EMPRESA_NAO_LIBERADA };

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
