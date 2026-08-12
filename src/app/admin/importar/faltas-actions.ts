"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { parseFaltas, type FaltaLinha } from "@/lib/parsers/faltas";

export type PreviewFaltaLinha = {
  matricula: string;
  nome: string;
  funcao: string;
  qtde: number;
};

export type PreviewFaltasResult = {
  empresa: { codigo: string; nome: string };
  competenciaSugerida: string | null;
  encontrados: PreviewFaltaLinha[];
  naoEncontrados: PreviewFaltaLinha[];
  totalFaltasNoPeriodoAtual: number;
};

async function montarDiff(linhas: FaltaLinha[], empresaId: string, periodo: { inicio: Date; fim: Date }) {
  const matriculas = linhas.map((l) => l.matricula);
  const funcionarios = await prisma.funcionario.findMany({
    where: { empresaId, matricula: { in: matriculas } },
  });
  const porMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));

  const encontrados: PreviewFaltaLinha[] = [];
  const naoEncontrados: PreviewFaltaLinha[] = [];
  for (const linha of linhas) {
    const item = { matricula: linha.matricula, nome: linha.nome, funcao: linha.funcao, qtde: linha.datas.length };
    if (porMatricula.has(linha.matricula)) encontrados.push(item);
    else naoEncontrados.push(item);
  }

  const totalFaltasNoPeriodoAtual = await prisma.falta.count({
    where: {
      data: { gte: periodo.inicio, lte: periodo.fim },
      funcionario: { empresaId },
    },
  });

  return { encontrados, naoEncontrados, totalFaltasNoPeriodoAtual };
}

export async function previewFaltas(conteudo: string): Promise<{ data: PreviewFaltasResult | null; error: string | null }> {
  await requireAdmin();

  let parsed;
  try {
    parsed = parseFaltas(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: parsed.empresa.codigo } });
  if (!empresa) {
    return {
      data: null,
      error: `Empresa ${parsed.empresa.codigo} (${parsed.empresa.nome}) ainda não está cadastrada — importe a folha de salários dela antes.`,
    };
  }

  const diff = await montarDiff(parsed.linhas, empresa.id, parsed.periodo);

  return {
    data: {
      empresa: parsed.empresa,
      competenciaSugerida: parsed.competenciaSugerida,
      encontrados: diff.encontrados,
      naoEncontrados: diff.naoEncontrados,
      totalFaltasNoPeriodoAtual: diff.totalFaltasNoPeriodoAtual,
    },
    error: null,
  };
}

export async function confirmarFaltas(
  conteudo: string,
  nomeArquivo: string,
  competencia: string
): Promise<{ error: string | null; resumo?: { faltasRegistradas: number; funcionarios: number; naoEncontrados: number } }> {
  const admin = await requireAdmin();

  if (!competencia.trim()) {
    return { error: "Selecione a competência antes de confirmar." };
  }

  let parsed;
  try {
    parsed = parseFaltas(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  if (parsed.competenciaSugerida && parsed.competenciaSugerida !== competencia) {
    return {
      error: `O período do arquivo (${parsed.competenciaSugerida}) não bate com a competência selecionada (${competencia}). Confira antes de importar.`,
    };
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: parsed.empresa.codigo } });
  if (!empresa) {
    return {
      error: `Empresa ${parsed.empresa.codigo} (${parsed.empresa.nome}) ainda não está cadastrada — importe a folha de salários dela antes.`,
    };
  }

  const resumo = await prisma.$transaction(async (tx) => {
    const funcionarios = await tx.funcionario.findMany({
      where: { empresaId: empresa.id, matricula: { in: parsed.linhas.map((l) => l.matricula) } },
    });
    const porMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));

    let faltasRegistradas = 0;
    let funcionariosTocados = 0;
    const naoEncontrados: { matricula: string; nome: string }[] = [];

    for (const linha of parsed.linhas) {
      const funcionario = porMatricula.get(linha.matricula);
      if (!funcionario) {
        naoEncontrados.push({ matricula: linha.matricula, nome: linha.nome });
        continue;
      }

      // Substitui as faltas já registradas nesse período — permite reimportar um arquivo corrigido
      // sem duplicar nem deixar lixo de uma importação anterior.
      await tx.falta.deleteMany({
        where: { funcionarioId: funcionario.id, data: { gte: parsed.periodo.inicio, lte: parsed.periodo.fim } },
      });
      await tx.falta.createMany({
        data: linha.datas.map((data) => ({ funcionarioId: funcionario.id, data })),
      });
      faltasRegistradas += linha.datas.length;
      funcionariosTocados++;
    }

    await tx.importacao.create({
      data: {
        empresaId: empresa.id,
        tipo: "faltas",
        importadoPorId: admin.id,
        nomeArquivo,
        competencia,
        criados: faltasRegistradas,
        atualizados: funcionariosTocados,
        naoEncontrados: naoEncontrados.length > 0 ? JSON.stringify(naoEncontrados) : null,
      },
    });

    return { faltasRegistradas, funcionarios: funcionariosTocados, naoEncontrados: naoEncontrados.length };
  });

  return { error: null, resumo };
}
