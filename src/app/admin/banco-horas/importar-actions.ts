"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { parseBancoHoras, type BancoHorasLinha } from "@/lib/parsers/banco-horas";
import { processarHistorico, type CompetenciaEntrada } from "@/lib/banco-horas";
import { funcaoNaoPodeCredito } from "@/lib/banco-horas-alertas";

function compararCompetencias(a: string, b: string): number {
  const [ma, aa] = a.split("/").map(Number);
  const [mb, ab] = b.split("/").map(Number);
  return aa !== ab ? aa - ab : ma - mb;
}

export type PreviewLinhaBancoHoras = { matricula: string; nome: string; competencias: string[] };

export type PreviewAlertaCredito = { matricula: string; nome: string; cargo: string; competencias: string[] };

export type PreviewBancoHorasResult = {
  empresa: { codigo: string; nome: string };
  periodoInicio: string;
  periodoFim: string;
  encontrados: PreviewLinhaBancoHoras[];
  naoEncontrados: PreviewLinhaBancoHoras[];
  competenciasJaImportadas: string[];
  alertasCredito: PreviewAlertaCredito[];
};

async function montarPreview(parsed: { empresa: { codigo: string; nome: string }; linhas: BancoHorasLinha[] }, empresaId: string) {
  const porMatricula = new Map<string, string[]>();
  for (const l of parsed.linhas) {
    const lista = porMatricula.get(l.matricula) ?? [];
    if (!lista.includes(l.competencia)) lista.push(l.competencia);
    porMatricula.set(l.matricula, lista);
  }

  const funcionarios = await prisma.funcionario.findMany({
    where: { empresaId, matricula: { in: [...porMatricula.keys()] } },
    select: { matricula: true, nome: true, temGratificacao: true, cargo: { select: { nome: true } } },
  });
  const funcPorMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));

  const encontrados: PreviewLinhaBancoHoras[] = [];
  const naoEncontrados: PreviewLinhaBancoHoras[] = [];
  const alertasCredito: PreviewAlertaCredito[] = [];
  for (const [matricula, competencias] of porMatricula) {
    const func = funcPorMatricula.get(matricula);
    const item = { matricula, nome: func?.nome ?? "", competencias: competencias.sort(compararCompetencias) };
    if (func) {
      encontrados.push(item);
      const competenciasComCredito = competencias.filter((c) =>
        parsed.linhas.some((l) => l.matricula === matricula && l.competencia === c && l.creditoDecimal > 0.001)
      );
      if (competenciasComCredito.length > 0 && funcaoNaoPodeCredito(func.cargo.nome, func.temGratificacao)) {
        alertasCredito.push({ matricula, nome: func.nome, cargo: func.cargo.nome, competencias: competenciasComCredito });
      }
    } else {
      naoEncontrados.push({ ...item, nome: `(não encontrado no cadastro)` });
    }
  }

  const todasCompetencias = [...new Set(parsed.linhas.map((l) => l.competencia))].sort(compararCompetencias);
  const existentes = await prisma.bancoHorasApuracao.findMany({
    where: { funcionario: { empresaId }, competencia: { in: todasCompetencias } },
    select: { competencia: true },
    distinct: ["competencia"],
  });

  return {
    encontrados: encontrados.sort((a, b) => a.matricula.localeCompare(b.matricula)),
    naoEncontrados: naoEncontrados.sort((a, b) => a.matricula.localeCompare(b.matricula)),
    competenciasJaImportadas: existentes.map((e) => e.competencia).sort(compararCompetencias),
    alertasCredito: alertasCredito.sort((a, b) => a.matricula.localeCompare(b.matricula)),
  };
}

export async function previewExtratoBancoHoras(
  conteudo: string
): Promise<{ data: PreviewBancoHorasResult | null; error: string | null }> {
  await requireAdmin();

  let parsed;
  try {
    parsed = parseBancoHoras(conteudo);
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

  const diff = await montarPreview(parsed, empresa.id);

  return {
    data: {
      empresa: parsed.empresa,
      periodoInicio: parsed.periodoInicio,
      periodoFim: parsed.periodoFim,
      ...diff,
    },
    error: null,
  };
}

export async function confirmarExtratoBancoHoras(
  conteudo: string,
  nomeArquivo: string
): Promise<{ error: string | null; resumo?: { funcionarios: number; competenciasRecalculadas: number; naoEncontrados: number } }> {
  const admin = await requireAdmin();

  let parsed;
  try {
    parsed = parseBancoHoras(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: parsed.empresa.codigo } });
  if (!empresa) {
    return {
      error: `Empresa ${parsed.empresa.codigo} (${parsed.empresa.nome}) ainda não está cadastrada — importe a folha de salários dela antes.`,
    };
  }

  const linhasPorMatricula = new Map<string, BancoHorasLinha[]>();
  for (const l of parsed.linhas) {
    const lista = linhasPorMatricula.get(l.matricula) ?? [];
    lista.push(l);
    linhasPorMatricula.set(l.matricula, lista);
  }

  const funcionarios = await prisma.funcionario.findMany({
    where: { empresaId: empresa.id, matricula: { in: [...linhasPorMatricula.keys()] } },
    select: { id: true, matricula: true },
  });
  const funcPorMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));
  const naoEncontrados = [...linhasPorMatricula.keys()].filter((m) => !funcPorMatricula.has(m));

  let competenciasRecalculadas = 0;
  let funcionariosTocados = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const [matricula, novasLinhas] of linhasPorMatricula) {
        const func = funcPorMatricula.get(matricula);
        if (!func) continue;

        const saldoInicial = await tx.bancoHorasSaldoInicial.findUnique({ where: { funcionarioId: func.id } });

        // Reconstrói a série completa de crédito/débito bruto já persistida (regra e: reimportação
        // sobrescreve a competência e recalcula o histórico a partir dela — como o motor é
        // determinístico e barato, reprocessamos a série inteira do funcionário).
        const apuracoesExistentes = await tx.bancoHorasApuracao.findMany({ where: { funcionarioId: func.id } });
        const seriePorCompetencia = new Map<string, CompetenciaEntrada>(
          apuracoesExistentes.map((a) => [
            a.competencia,
            { competencia: a.competencia, creditoDecimal: Number(a.creditoBruto), debitoDecimal: Number(a.debitoBruto) },
          ])
        );
        for (const l of novasLinhas) {
          seriePorCompetencia.set(l.competencia, {
            competencia: l.competencia,
            creditoDecimal: l.creditoDecimal,
            debitoDecimal: l.debitoDecimal,
          });
        }
        const serie = [...seriePorCompetencia.values()].sort((a, b) => compararCompetencias(a.competencia, b.competencia));

        const saldoInicialDecimal = saldoInicial ? Number(saldoInicial.saldoDecimal) : 0;
        const { apuracoes } = processarHistorico(saldoInicialDecimal, serie);

        for (const a of apuracoes) {
          await tx.bancoHorasApuracao.upsert({
            where: { funcionarioId_competencia: { funcionarioId: func.id, competencia: a.competencia } },
            create: {
              funcionarioId: func.id,
              competencia: a.competencia,
              creditoBruto: a.creditoBrutoDecimal,
              debitoBruto: a.debitoBrutoDecimal,
              creditoLiquido: a.creditoLiquidoDecimal,
              pagoNoMes: a.pagoNoMesDecimal,
              saldoPositivo: a.saldoPositivoDecimal,
              saldoNegativo: a.saldoNegativoDecimal,
              saldoFinal: a.saldoFinalDecimal,
            },
            update: {
              creditoBruto: a.creditoBrutoDecimal,
              debitoBruto: a.debitoBrutoDecimal,
              creditoLiquido: a.creditoLiquidoDecimal,
              pagoNoMes: a.pagoNoMesDecimal,
              saldoPositivo: a.saldoPositivoDecimal,
              saldoNegativo: a.saldoNegativoDecimal,
              saldoFinal: a.saldoFinalDecimal,
            },
          });
        }
        competenciasRecalculadas += apuracoes.length;
        funcionariosTocados++;
      }

      await tx.bancoHorasImportacao.create({
        data: {
          empresaId: empresa.id,
          importadoPorId: admin.id,
          nomeArquivo,
          periodoInicio: parsed.periodoInicio,
          periodoFim: parsed.periodoFim,
          criados: funcionariosTocados,
          atualizados: 0,
          naoEncontrados: naoEncontrados.length > 0 ? JSON.stringify(naoEncontrados) : null,
        },
      });
    },
    { timeout: 60_000 }
  );

  return {
    error: null,
    resumo: { funcionarios: funcionariosTocados, competenciasRecalculadas, naoEncontrados: naoEncontrados.length },
  };
}
