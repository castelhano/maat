"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { parseAfastamentos, type AfastamentoLinha, type AfastamentosParseResult } from "@/lib/parsers/afastamentos";

export type PreviewAtualizacaoAfastamento = {
  matricula: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  mudancas: string[];
};

export type PreviewAmbiguoAfastamento = {
  matricula: string;
  nome: string;
  empresasPossiveis: { id: string; nome: string }[];
};

export type PreviewPossivelRetorno = {
  matricula: string;
  nome: string;
  empresaNome: string;
  dataAfastamentoAtual: string | null;
};

export type PreviewAfastamentosResult = {
  totalLinhas: number;
  atualizados: PreviewAtualizacaoAfastamento[];
  semMudanca: number;
  ambiguos: PreviewAmbiguoAfastamento[];
  naoEncontrados: { matricula: string; nome: string }[];
  possiveisRetornos: PreviewPossivelRetorno[];
};

async function montarDiff(linhas: AfastamentoLinha[]) {
  const matriculas = linhas.map((l) => l.matricula);
  const funcionarios = await prisma.funcionario.findMany({
    where: { matricula: { in: matriculas } },
    include: { empresa: true },
  });
  const porMatricula = new Map<string, typeof funcionarios>();
  for (const f of funcionarios) {
    const lista = porMatricula.get(f.matricula) ?? [];
    lista.push(f);
    porMatricula.set(f.matricula, lista);
  }

  const atualizados: PreviewAtualizacaoAfastamento[] = [];
  const ambiguos: PreviewAmbiguoAfastamento[] = [];
  const naoEncontrados: { matricula: string; nome: string }[] = [];
  let semMudanca = 0;

  for (const linha of linhas) {
    const candidatos = porMatricula.get(linha.matricula) ?? [];
    if (candidatos.length === 0) {
      naoEncontrados.push({ matricula: linha.matricula, nome: linha.nome });
      continue;
    }
    if (candidatos.length > 1) {
      ambiguos.push({
        matricula: linha.matricula,
        nome: linha.nome,
        empresasPossiveis: candidatos.map((c) => ({ id: c.empresaId, nome: c.empresa.nome })),
      });
      continue;
    }

    const funcionario = candidatos[0];
    const mudancas: string[] = [];
    if (funcionario.status !== "afastado") {
      mudancas.push(`situação: ${funcionario.status} → afastado`);
    }
    const dataAtual = funcionario.dataAfastamento?.getTime() ?? null;
    if (dataAtual !== linha.dataAfastamento.getTime()) {
      mudancas.push(
        `data do afastamento: ${funcionario.dataAfastamento ? funcionario.dataAfastamento.toLocaleDateString("pt-BR") : "—"} → ${linha.dataAfastamento.toLocaleDateString("pt-BR")}`
      );
    }
    if ((funcionario.motivoAfastamento ?? "") !== linha.motivo) {
      mudancas.push(`motivo: ${funcionario.motivoAfastamento ?? "—"} → ${linha.motivo}`);
    }

    if (mudancas.length > 0) {
      atualizados.push({
        matricula: linha.matricula,
        nome: linha.nome,
        empresaId: funcionario.empresaId,
        empresaNome: funcionario.empresa.nome,
        mudancas,
      });
    } else {
      semMudanca++;
    }
  }

  // Quem está "afastado" no cadastro mas não apareceu neste arquivo pode ter retornado ao
  // trabalho — o arquivo lista só quem está afastado hoje, então a ausência é um sinal, não uma
  // certeza (o arquivo pode ter vindo de uma empresa só, por exemplo).
  const matriculasNoArquivo = new Set(matriculas);
  const afastadosNoCadastro = await prisma.funcionario.findMany({
    where: { status: "afastado", matricula: { notIn: [...matriculasNoArquivo] } },
    include: { empresa: true },
  });
  const possiveisRetornos: PreviewPossivelRetorno[] = afastadosNoCadastro.map((f) => ({
    matricula: f.matricula,
    nome: f.nome,
    empresaNome: f.empresa.nome,
    dataAfastamentoAtual: f.dataAfastamento ? f.dataAfastamento.toISOString() : null,
  }));

  return { atualizados, ambiguos, naoEncontrados, semMudanca, possiveisRetornos };
}

export async function previewAfastamentos(
  conteudo: string
): Promise<{ data: PreviewAfastamentosResult | null; error: string | null }> {
  await requireAdmin();

  let parsed;
  try {
    parsed = parseAfastamentos(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  return {
    data: {
      totalLinhas: parsed.linhas.length,
      atualizados: diff.atualizados,
      semMudanca: diff.semMudanca,
      ambiguos: diff.ambiguos,
      naoEncontrados: diff.naoEncontrados,
      possiveisRetornos: diff.possiveisRetornos,
    },
    error: null,
  };
}

export async function confirmarAfastamentos(
  conteudo: string,
  nomeArquivo: string,
  competencia: string,
  resolucoesAmbiguas: Record<string, string>
): Promise<{ error: string | null; resumo?: { atualizados: number; naoEncontrados: number } }> {
  const admin = await requireAdmin();

  if (!competencia.trim()) {
    return { error: "Selecione a competência antes de confirmar." };
  }

  let parsed: AfastamentosParseResult;
  try {
    parsed = parseAfastamentos(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  const ambiguosPendentes = diff.ambiguos.filter((a) => !resolucoesAmbiguas[a.matricula]);
  if (ambiguosPendentes.length > 0) {
    return {
      error: `${ambiguosPendentes.length} matrícula(s) ambígua(s) ainda sem empresa escolhida. Resolva antes de confirmar.`,
    };
  }

  const resumo = await prisma.$transaction(async (tx) => {
    let atualizadosCount = 0;
    const porEmpresa = new Map<string, number>();

    async function aplicar(empresaId: string, matricula: string) {
      const linha = parsed.linhas.find((l) => l.matricula === matricula)!;
      await tx.funcionario.updateMany({
        where: { empresaId, matricula },
        data: { status: "afastado", dataAfastamento: linha.dataAfastamento, motivoAfastamento: linha.motivo },
      });
      atualizadosCount++;
      porEmpresa.set(empresaId, (porEmpresa.get(empresaId) ?? 0) + 1);
    }

    for (const item of diff.atualizados) {
      await aplicar(item.empresaId, item.matricula);
    }
    for (const ambiguo of diff.ambiguos) {
      const empresaId = resolucoesAmbiguas[ambiguo.matricula];
      const existe = await tx.funcionario.findUnique({
        where: { empresaId_matricula: { empresaId, matricula: ambiguo.matricula } },
      });
      if (existe) await aplicar(empresaId, ambiguo.matricula);
    }

    for (const [empresaId, atualizados] of porEmpresa) {
      await tx.importacao.create({
        data: {
          empresaId,
          tipo: "afastamentos",
          importadoPorId: admin.id,
          nomeArquivo,
          competencia,
          criados: 0,
          atualizados,
          naoEncontrados: null,
        },
      });
    }

    return { atualizados: atualizadosCount, naoEncontrados: diff.naoEncontrados.length };
  });

  return { error: null, resumo };
}
