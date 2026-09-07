"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { chaveCompetencia, diasUteisNoMes, labelMotivoFalta } from "@/lib/indicadores";

const DESDE_COMPETENCIA = "01/2026";

export type AbsenteismoMes = {
  competencia: string;
  totalDias: number;
  diasUteis: number;
  ativos: number;
  percentual: number;
  porMotivo: { motivo: string; dias: number }[];
};

function competenciaDaData(data: Date): string {
  return `${String(data.getUTCMonth() + 1).padStart(2, "0")}/${data.getUTCFullYear()}`;
}

export async function carregarAbsenteismo(filtro: { empresaId?: string; setor?: string }): Promise<{
  meses: AbsenteismoMes[];
}> {
  await requireAdmin();

  const [mesInicio, anoInicio] = DESDE_COMPETENCIA.split("/").map(Number);

  const faltas = await prisma.falta.findMany({
    where: {
      data: { gte: new Date(Date.UTC(anoInicio, mesInicio - 1, 1)) },
      funcionario: {
        ...(filtro.empresaId ? { empresaId: filtro.empresaId } : {}),
        ...(filtro.setor ? { cargo: { setor: filtro.setor } } : {}),
      },
    },
    select: { data: true, ocorrencia: true },
  });

  const indicadores = await prisma.indicadorMensal.findMany({
    where: {
      ...(filtro.empresaId ? { empresaId: filtro.empresaId } : {}),
      ...(filtro.setor ? { setor: filtro.setor } : {}),
    },
    select: { competencia: true, ativos: true },
  });

  const ativosPorCompetencia = new Map<string, number>();
  for (const i of indicadores) {
    ativosPorCompetencia.set(i.competencia, (ativosPorCompetencia.get(i.competencia) ?? 0) + i.ativos);
  }

  const porCompetencia = new Map<string, { total: number; motivos: Map<string, number> }>();
  for (const f of faltas) {
    const competencia = competenciaDaData(f.data);
    const bucket = porCompetencia.get(competencia) ?? { total: 0, motivos: new Map<string, number>() };
    bucket.total++;
    const motivo = labelMotivoFalta(f.ocorrencia ?? "");
    bucket.motivos.set(motivo, (bucket.motivos.get(motivo) ?? 0) + 1);
    porCompetencia.set(competencia, bucket);
  }

  const desdeChave = chaveCompetencia(DESDE_COMPETENCIA);
  const meses: AbsenteismoMes[] = [...porCompetencia.entries()]
    .filter(([competencia]) => chaveCompetencia(competencia) >= desdeChave)
    .sort((a, b) => chaveCompetencia(a[0]) - chaveCompetencia(b[0]))
    .map(([competencia, bucket]) => {
      const ativos = ativosPorCompetencia.get(competencia) ?? 0;
      const diasUteis = diasUteisNoMes(competencia);
      const percentual = ativos > 0 && diasUteis > 0 ? (bucket.total / (ativos * diasUteis)) * 100 : 0;
      return {
        competencia,
        totalDias: bucket.total,
        diasUteis,
        ativos,
        percentual,
        porMotivo: [...bucket.motivos.entries()]
          .map(([motivo, dias]) => ({ motivo, dias }))
          .sort((a, b) => b.dias - a.dias),
      };
    });

  return { meses };
}
