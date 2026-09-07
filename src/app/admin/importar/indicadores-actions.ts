"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { extrairTextoPdf } from "@/lib/pdf";
import { parseResumoGerencial } from "@/lib/parsers/resumo-gerencial";
import { CAMPOS_INDICADOR, type CampoIndicador } from "@/lib/indicadores";

export type PreviewIndicadorLinha = { setor: string } & Record<CampoIndicador, number | null>;

export type PreviewIndicadoresResult = {
  empresaId: string;
  empresaNome: string;
  competencia: string;
  linhas: PreviewIndicadorLinha[];
};

export async function previewIndicadores(
  pdfBase64: string
): Promise<{ data: PreviewIndicadoresResult | null; error: string | null }> {
  await requireAdmin();

  let parsed;
  try {
    const bytes = Buffer.from(pdfBase64, "base64");
    const texto = await extrairTextoPdf(bytes);
    parsed = parseResumoGerencial(texto);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o PDF." };
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: parsed.empresaCodigo } });
  if (!empresa) {
    return {
      data: null,
      error: `Empresa ${parsed.empresaCodigo} ainda não está cadastrada — importe a folha de salários dela antes.`,
    };
  }

  return {
    data: { empresaId: empresa.id, empresaNome: empresa.nome, competencia: parsed.competencia, linhas: parsed.linhas },
    error: null,
  };
}

export type IndicadorLinhaEditada = { setor: string; camposManuais: CampoIndicador[] } & Record<
  CampoIndicador,
  number
>;

export async function confirmarIndicadores(
  empresaId: string,
  competencia: string,
  nomeArquivo: string,
  linhas: IndicadorLinhaEditada[]
): Promise<{ error: string | null; resumo?: { gravados: number } }> {
  const admin = await requireAdmin();

  if (!competencia.trim()) return { error: "Competência não informada." };
  if (linhas.length === 0) return { error: "Nenhuma área pra gravar." };

  // Campo que não veio do PDF chega zerado do cliente (não bloqueia a confirmação) — só
  // `camposManuais` registra quais foram assim, pra aparecer sinalizado na tela depois.
  for (const linha of linhas) {
    for (const campo of CAMPOS_INDICADOR) {
      if (typeof linha[campo] !== "number" || Number.isNaN(linha[campo])) {
        return { error: `Valor inválido no campo "${campo}" da área ${linha.setor}.` };
      }
    }
  }

  const resumo = await prisma.$transaction(async (tx) => {
    for (const linha of linhas) {
      const dados = {} as Record<CampoIndicador, number> & { camposManuais: string | null; importadoPorId: string };
      for (const campo of CAMPOS_INDICADOR) dados[campo] = linha[campo];
      dados.camposManuais = linha.camposManuais.length > 0 ? JSON.stringify(linha.camposManuais) : null;
      dados.importadoPorId = admin.id;

      await tx.indicadorMensal.upsert({
        where: { empresaId_setor_competencia: { empresaId, setor: linha.setor, competencia } },
        create: { empresaId, setor: linha.setor, competencia, ...dados },
        update: dados,
      });
    }

    await tx.importacao.create({
      data: {
        empresaId,
        tipo: "indicadores_mensais",
        importadoPorId: admin.id,
        nomeArquivo,
        competencia,
        criados: linhas.length,
        atualizados: 0,
        naoEncontrados: null,
      },
    });

    return { gravados: linhas.length };
  });

  return { error: null, resumo };
}
