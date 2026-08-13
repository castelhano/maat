"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { primeiraPalavra } from "@/lib/utils";
import { calcularElegibilidadeCesta, calcularVR, calcularValorCestaConvertida, resolverHeranca } from "@/lib/beneficios";

export type ApuracaoItemDTO = {
  tipo: string;
  matricula: string | null;
  nome: string;
  cargo: string | null;
  salario: number | null;
  dataAdmissao: string | null;
  empresaNome: string;
  empresaAbbr: string;
  elegivelCestaBasica: boolean;
  motivoPerdaCesta: string | null;
  recebeCestaComoVR: boolean;
  valorCestaConvertida: number | null;
  elegivelVR: boolean;
  motivoPerdaVR: string | null;
  baseCalculoVR: number | null;
  valorVR: number;
};

export type ApuracaoResumo = {
  competencia: string;
  geradoEm: string | null;
  itens: ApuracaoItemDTO[];
};

function parseCompetencia(competencia: string): { ano: number; mes: number } {
  const [mes, ano] = competencia.split("/").map(Number);
  return { ano, mes };
}

export async function carregarApuracao(competencia: string): Promise<ApuracaoResumo | null> {
  await requireAdmin();
  if (!competencia.trim()) return null;

  const apuracoes = await prisma.apuracao.findMany({
    where: { competencia },
    include: { itens: true, empresa: true },
    orderBy: { empresa: { nome: "asc" } },
  });

  if (apuracoes.length === 0) return { competencia, geradoEm: null, itens: [] };

  const geradoEm = apuracoes.reduce<Date | null>((acc, a) => (!acc || a.createdAt > acc ? a.createdAt : acc), null);

  const itens: ApuracaoItemDTO[] = apuracoes.flatMap((a) =>
    a.itens.map((i) => ({
      tipo: i.tipo,
      matricula: i.matricula,
      nome: i.nome,
      cargo: i.cargo,
      salario: i.salario?.toNumber() ?? null,
      dataAdmissao: i.dataAdmissao ? i.dataAdmissao.toISOString() : null,
      empresaNome: a.empresa.nome,
      empresaAbbr: a.empresa.abbr || primeiraPalavra(a.empresa.nome),
      elegivelCestaBasica: i.elegivelCestaBasica,
      motivoPerdaCesta: i.motivoPerdaCesta,
      recebeCestaComoVR: i.recebeCestaComoVR,
      valorCestaConvertida: i.valorCestaConvertida?.toNumber() ?? null,
      elegivelVR: i.elegivelVR,
      motivoPerdaVR: i.motivoPerdaVR,
      baseCalculoVR: i.baseCalculoVR?.toNumber() ?? null,
      valorVR: i.valorVR.toNumber(),
    }))
  );

  return { competencia, geradoEm: geradoEm ? geradoEm.toISOString() : null, itens };
}

export async function processarApuracao(
  competencia: string
): Promise<{ error: string | null; resumo?: { empresas: number; itens: number } }> {
  const admin = await requireAdmin();
  if (!competencia.trim()) return { error: "Selecione a competência." };

  const { ano, mes } = parseCompetencia(competencia);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));

  const empresas = await prisma.empresa.findMany();

  let empresasProcessadas = 0;
  let itensTotal = 0;

  for (const empresa of empresas) {
    const funcionarios = await prisma.funcionario.findMany({
      where: { empresaId: empresa.id },
      include: { cargo: true },
    });
    const terceiros = await prisma.terceiro.findMany({ where: { empresaId: empresa.id, ativo: true } });

    const faltasAgrupadas = await prisma.falta.groupBy({
      by: ["funcionarioId"],
      where: { funcionarioId: { in: funcionarios.map((f) => f.id) }, data: { gte: inicio, lte: fim } },
      _count: { _all: true },
    });
    const faltasPorFuncionario = new Map(faltasAgrupadas.map((f) => [f.funcionarioId, f._count._all]));

    const valorCestaBasicaEmpresa = empresa.valorCestaBasica?.toNumber() ?? null;
    const itens: Prisma.ApuracaoItemCreateWithoutApuracaoInput[] = [];

    for (const f of funcionarios) {
      const recebeCestaResolvido = resolverHeranca(f.recebeCestaBasica, f.cargo.recebeCestaBasica);
      const recebeVRResolvido = resolverHeranca(f.recebeValeRefeicao, f.cargo.recebeValeRefeicao);

      const cesta = calcularElegibilidadeCesta(
        {
          status: f.status,
          dataAdmissao: f.dataAdmissao,
          dataAfastamento: f.dataAfastamento,
          motivoAfastamento: f.motivoAfastamento,
          faltasNoMes: faltasPorFuncionario.get(f.id) ?? 0,
          recebeCestaBasicaResolvido: recebeCestaResolvido,
        },
        { ano, mes }
      );

      const vr = calcularVR(
        {
          status: f.status,
          salario: f.salario.toNumber(),
          temGratificacao: f.temGratificacao,
          valorValeRefeicao: f.valorValeRefeicao?.toNumber() ?? null,
          recebeValeRefeicaoResolvido: recebeVRResolvido,
          dataAdmissao: f.dataAdmissao,
          dataAfastamento: f.dataAfastamento,
        },
        { ano, mes }
      );

      const valorCestaConvertida = calcularValorCestaConvertida({
        elegivelCesta: cesta.elegivel,
        recebeCestaComoVR: f.recebeCestaComoVR,
        valorCestaBasicaEmpresa,
      });

      itens.push({
        tipo: "funcionario",
        matricula: f.matricula,
        nome: f.nome,
        cargo: f.cargo.nome,
        salario: f.salario,
        dataAdmissao: f.dataAdmissao,
        elegivelCestaBasica: cesta.elegivel,
        motivoPerdaCesta: cesta.motivo,
        recebeCestaComoVR: f.recebeCestaComoVR,
        valorCestaConvertida,
        elegivelVR: vr.elegivel,
        motivoPerdaVR: vr.motivo,
        baseCalculoVR: vr.baseCalculo,
        valorVR: vr.valor + (valorCestaConvertida ?? 0),
      });
    }

    for (const t of terceiros) {
      const valorVRBase = t.recebeValeRefeicao ? (t.valorValeRefeicao?.toNumber() ?? 0) : 0;
      const valorCestaConvertida = calcularValorCestaConvertida({
        elegivelCesta: t.recebeCestaBasica,
        recebeCestaComoVR: t.recebeCestaComoVR,
        valorCestaBasicaEmpresa,
      });

      itens.push({
        tipo: "terceiro",
        matricula: null,
        nome: t.nome,
        cargo: null,
        salario: null,
        dataAdmissao: null,
        elegivelCestaBasica: t.recebeCestaBasica,
        motivoPerdaCesta: t.recebeCestaBasica ? null : "Terceiro sem direito a cesta básica (configuração manual)",
        recebeCestaComoVR: t.recebeCestaComoVR,
        valorCestaConvertida,
        elegivelVR: t.recebeValeRefeicao,
        motivoPerdaVR: t.recebeValeRefeicao ? null : "Terceiro sem vale-refeição configurado",
        baseCalculoVR: null,
        valorVR: valorVRBase + (valorCestaConvertida ?? 0),
      });
    }

    if (itens.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await tx.apuracao.deleteMany({ where: { empresaId: empresa.id, competencia } });
      await tx.apuracao.create({
        data: {
          empresaId: empresa.id,
          competencia,
          geradoPorId: admin.id,
          itens: { create: itens },
        },
      });
    });

    empresasProcessadas++;
    itensTotal += itens.length;
  }

  return { error: null, resumo: { empresas: empresasProcessadas, itens: itensTotal } };
}
