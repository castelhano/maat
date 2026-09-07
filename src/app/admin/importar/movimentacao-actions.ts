"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { parseAdmitidosDesligados, type EventoLinha } from "@/lib/parsers/admitidos-desligados";

const FUNCAO_APRENDIZ = "APRENDIZ";

async function resolverSetorAprendiz(): Promise<string | null> {
  // SQLite não tem filtro "insensitive" no Prisma — compara em memória.
  const cargos = await prisma.cargo.findMany({ select: { nome: true, setor: true } });
  const cargo = cargos.find((c) => c.nome.toUpperCase() === FUNCAO_APRENDIZ);
  return cargo?.setor ?? null;
}

export type PreviewMovimentacaoLinha = { competencia: string; quantidade: number; indicadorExiste: boolean };

export type PreviewFuncionarioSync = { matricula: string; nome: string };

export type PreviewMovimentacaoResult = {
  empresaId: string;
  empresaNome: string;
  tipo: "admitidos" | "desligados";
  totalLinhasArquivo: number;
  linhas: PreviewMovimentacaoLinha[];
  // Só preenchido quando o arquivo tem matrícula confiável (formato CSV) e é o relatório de
  // desligados — sincroniza o status "desligado" no cadastro de Funcionário.
  syncFuncionarios: {
    paraAtualizar: PreviewFuncionarioSync[];
    jaDesligados: number;
    naoEncontrados: PreviewFuncionarioSync[];
  } | null;
};

async function montarPreview(conteudo: string): Promise<{ data: PreviewMovimentacaoResult | null; error: string | null }> {
  let parsed;
  try {
    parsed = parseAdmitidosDesligados(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: parsed.empresaCodigo } });
  if (!empresa) {
    return {
      data: null,
      error: `Empresa ${parsed.empresaCodigo} ainda não está cadastrada — importe a folha de salários dela antes.`,
    };
  }

  const setor = await resolverSetorAprendiz();
  if (!setor) {
    return {
      data: null,
      error: 'Não encontrei o cargo "Aprendiz" cadastrado — sincronize os cargos (folha de salários) antes de importar este relatório.',
    };
  }

  const porCompetencia = new Map<string, number>();
  for (const linha of parsed.linhas) {
    if (linha.funcao.toUpperCase() !== FUNCAO_APRENDIZ) continue;
    porCompetencia.set(linha.competencia, (porCompetencia.get(linha.competencia) ?? 0) + 1);
  }

  const competencias = [...porCompetencia.keys()];
  const indicadoresExistentes = await prisma.indicadorMensal.findMany({
    where: { empresaId: empresa.id, setor, competencia: { in: competencias } },
    select: { competencia: true },
  });
  const existentes = new Set(indicadoresExistentes.map((i) => i.competencia));

  const linhas = competencias
    .sort()
    .map((competencia) => ({
      competencia,
      quantidade: porCompetencia.get(competencia)!,
      indicadorExiste: existentes.has(competencia),
    }));

  // Sincronização do cadastro de Funcionário: só entra quando a matrícula veio confiável (CSV) e o
  // relatório é o de desligados — para admitidos, quem cria/atualiza o cadastro é a folha de
  // salários (que já traz cargo e salário, que esse relatório não tem).
  let syncFuncionarios: PreviewMovimentacaoResult["syncFuncionarios"] = null;
  if (parsed.tipo === "desligados") {
    const comMatricula = parsed.linhas.filter((l): l is EventoLinha & { matricula: string } => l.matricula !== null);
    if (comMatricula.length > 0) {
      const funcionarios = await prisma.funcionario.findMany({
        where: { empresaId: empresa.id, matricula: { in: comMatricula.map((l) => l.matricula) } },
        select: { matricula: true, status: true },
      });
      const porMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));

      const paraAtualizar: PreviewFuncionarioSync[] = [];
      const naoEncontrados: PreviewFuncionarioSync[] = [];
      let jaDesligados = 0;
      for (const linha of comMatricula) {
        const funcionario = porMatricula.get(linha.matricula);
        if (!funcionario) {
          naoEncontrados.push({ matricula: linha.matricula, nome: linha.nome });
        } else if (funcionario.status === "desligado") {
          jaDesligados++;
        } else {
          paraAtualizar.push({ matricula: linha.matricula, nome: linha.nome });
        }
      }
      syncFuncionarios = { paraAtualizar, jaDesligados, naoEncontrados };
    }
  }

  return {
    data: {
      empresaId: empresa.id,
      empresaNome: empresa.nome,
      tipo: parsed.tipo,
      totalLinhasArquivo: parsed.linhas.length,
      linhas,
      syncFuncionarios,
    },
    error: null,
  };
}

export async function previewMovimentacaoAprendiz(
  conteudo: string
): Promise<{ data: PreviewMovimentacaoResult | null; error: string | null }> {
  await requireAdmin();
  return montarPreview(conteudo);
}

export async function confirmarMovimentacaoAprendiz(
  conteudo: string,
  nomeArquivo: string
): Promise<{
  error: string | null;
  resumo?: {
    competenciasAtualizadas: number;
    competenciasSemIndicador: number;
    funcionariosDesligados: number;
    funcionariosNaoEncontrados: number;
  };
}> {
  const admin = await requireAdmin();

  let parsed;
  try {
    parsed = parseAdmitidosDesligados(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const preview = await montarPreview(conteudo);
  if (preview.error || !preview.data) return { error: preview.error ?? "Erro ao processar o arquivo." };

  const { empresaId, tipo, linhas, syncFuncionarios } = preview.data;
  const setor = await resolverSetorAprendiz();
  if (!setor) return { error: 'Não encontrei o cargo "Aprendiz" cadastrado.' };

  const campo = tipo === "admitidos" ? "aprendizesAdmitidos" : "aprendizesDesligados";

  let competenciasAtualizadas = 0;
  let competenciasSemIndicador = 0;

  await prisma.$transaction(async (tx) => {
    for (const linha of linhas) {
      const resultado = await tx.indicadorMensal.updateMany({
        where: { empresaId, setor, competencia: linha.competencia },
        data: { [campo]: linha.quantidade },
      });
      if (resultado.count > 0) competenciasAtualizadas++;
      else competenciasSemIndicador++;
    }

    if (syncFuncionarios) {
      const eventosComData = parsed.linhas.filter(
        (l): l is EventoLinha & { matricula: string; dataEvento: Date } => l.matricula !== null && l.dataEvento !== null
      );
      for (const alvo of syncFuncionarios.paraAtualizar) {
        const evento = eventosComData.find((e) => e.matricula === alvo.matricula);
        if (!evento) continue;
        await tx.funcionario.updateMany({
          where: { empresaId, matricula: alvo.matricula },
          data: { status: "desligado", dataDesligamento: evento.dataEvento },
        });
      }
    }

    await tx.importacao.create({
      data: {
        empresaId,
        tipo: tipo === "admitidos" ? "movimentacao_aprendiz_admitidos" : "movimentacao_aprendiz_desligados",
        importadoPorId: admin.id,
        nomeArquivo,
        competencia: linhas.map((l) => l.competencia).join(", ") || "-",
        criados: 0,
        atualizados: competenciasAtualizadas + (syncFuncionarios?.paraAtualizar.length ?? 0),
        naoEncontrados:
          syncFuncionarios && syncFuncionarios.naoEncontrados.length > 0
            ? JSON.stringify(syncFuncionarios.naoEncontrados)
            : null,
      },
    });
  });

  return {
    error: null,
    resumo: {
      competenciasAtualizadas,
      competenciasSemIndicador,
      funcionariosDesligados: syncFuncionarios?.paraAtualizar.length ?? 0,
      funcionariosNaoEncontrados: syncFuncionarios?.naoEncontrados.length ?? 0,
    },
  };
}
