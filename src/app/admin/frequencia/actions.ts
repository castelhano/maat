"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";

// A análise de frequência é feita toda no navegador e não fica gravada; o relatório só traz o
// código do colaborador, então buscamos aqui o nome no cadastro da empresa.
const entradaSchema = z.object({
  empresaCodigo: z.string().regex(/^\d{3}$/),
  matriculas: z.array(z.string().regex(/^\d{6}$/)).max(5000),
});

export async function buscarNomesFrequencia(
  empresaCodigo: string,
  matriculas: string[]
): Promise<{ empresaNome: string | null; nomes: Record<string, string> }> {
  await requirePermissao("frequencia", "consultar");
  const parsed = entradaSchema.safeParse({ empresaCodigo, matriculas });
  if (!parsed.success) return { empresaNome: null, nomes: {} };

  const empresa = await prisma.empresa.findUnique({
    where: { codigo: parsed.data.empresaCodigo },
    select: { id: true, nome: true, abbr: true },
  });
  if (!empresa) return { empresaNome: null, nomes: {} };

  const procuradas = new Set(parsed.data.matriculas);
  const funcionarios = await prisma.funcionario.findMany({
    where: { empresaId: empresa.id },
    select: { matricula: true, nome: true },
  });
  const nomes: Record<string, string> = {};
  for (const f of funcionarios) {
    const matricula = f.matricula.padStart(6, "0");
    if (procuradas.has(matricula)) nomes[matricula] = f.nome;
  }
  return { empresaNome: empresa.abbr || empresa.nome, nomes };
}
