"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { CAMPOS_INDICADOR, chaveCompetencia, competenciaAnterior, type CampoIndicador } from "@/lib/indicadores";

const DESDE_COMPETENCIA = "01/2026";

export type IndicadorLinha = {
  id: string;
  competencia: string;
  setor: string;
  empresaId: string;
  empresaNome: string;
  // IRRF "do mês", já combinado (não é um campo cru — ver comentário abaixo).
  irrf: number;
} & Record<CampoIndicador, number>;

export type OpcaoEmpresa = { id: string; nome: string };

export async function listarEmpresasIndicadores(): Promise<OpcaoEmpresa[]> {
  await requireAdmin();
  const empresas = await prisma.empresa.findMany({
    where: { indicadoresMensais: { some: {} } },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  return empresas;
}

// "Aprendizes ativos" não tem como vir de um relatório de admitidos/desligados (é foto de um
// momento, não evento) — pra competência ATUAL calcula direto do cadastro de Funcionário em vez de
// depender do valor editado manualmente. Meses passados continuam com o que foi editado/importado
// (o cadastro só reflete o estado de hoje, não dá pra reconstruir retroativo com isso).
async function contarAprendizesAtivosPorEmpresa(): Promise<{ setor: string | null; porEmpresa: Map<string, number> }> {
  const cargos = await prisma.cargo.findMany({ select: { nome: true, setor: true } });
  const cargoAprendiz = cargos.find((c) => c.nome.toUpperCase() === "APRENDIZ");
  if (!cargoAprendiz) return { setor: null, porEmpresa: new Map() };

  const funcionarios = await prisma.funcionario.findMany({
    where: { status: "ativo", cargo: { nome: cargoAprendiz.nome } },
    select: { empresaId: true },
  });
  const porEmpresa = new Map<string, number>();
  for (const f of funcionarios) porEmpresa.set(f.empresaId, (porEmpresa.get(f.empresaId) ?? 0) + 1);
  return { setor: cargoAprendiz.setor, porEmpresa };
}

function competenciaAtual(): string {
  const agora = new Date();
  return `${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;
}

export async function carregarIndicadores(filtro: {
  empresaId?: string;
  setor?: string;
}): Promise<{ linhas: IndicadorLinha[] }> {
  await requireAdmin();

  // Busca sem limitar por competência aqui — o IRRF "do mês" de jan/2026 depende do irrfNormal
  // lançado em dez/2025, então precisa desse histórico completo antes de cortar a partir de
  // DESDE_COMPETENCIA no resultado final.
  const registros = await prisma.indicadorMensal.findMany({
    where: {
      ...(filtro.empresaId ? { empresaId: filtro.empresaId } : {}),
      ...(filtro.setor ? { setor: filtro.setor } : {}),
    },
    include: { empresa: { select: { nome: true, abbr: true } } },
  });

  const mesAtual = competenciaAtual();
  const { setor: setorAprendiz, porEmpresa: aprendizesAtivosPorEmpresa } = await contarAprendizesAtivosPorEmpresa();

  const irrfNormalPorChave = new Map<string, number>();
  for (const r of registros) {
    irrfNormalPorChave.set(`${r.empresaId}|${r.setor}|${r.competencia}`, r.irrfNormal.toNumber());
  }

  const desde = chaveCompetencia(DESDE_COMPETENCIA);

  const linhas: IndicadorLinha[] = registros
    .filter((r) => chaveCompetencia(r.competencia) >= desde)
    .sort((a, b) => chaveCompetencia(a.competencia) - chaveCompetencia(b.competencia))
    .map((r) => {
      // O sistema de origem lança o IRRF normal (código 00453) com 1 mês de atraso em relação ao
      // IRRF de férias (código 00481) — por isso o IRRF "do mês" exibido soma o irrfFerias desta
      // competência com o irrfNormal da competência ANTERIOR (ex.: IRRF de agosto = IRF férias de
      // agosto + IRRF normal de julho). Sem registro do mês anterior, assume 0 (melhor esforço).
      const irrfNormalMesAnterior =
        irrfNormalPorChave.get(`${r.empresaId}|${r.setor}|${competenciaAnterior(r.competencia)}`) ?? 0;

      const campos = {} as Record<CampoIndicador, number>;
      for (const campo of CAMPOS_INDICADOR) {
        const valor = r[campo];
        campos[campo] = typeof valor === "number" ? valor : valor.toNumber();
      }
      if (r.competencia === mesAtual && r.setor === setorAprendiz) {
        campos.aprendizesAtivos = aprendizesAtivosPorEmpresa.get(r.empresaId) ?? 0;
      }

      return {
        id: r.id,
        competencia: r.competencia,
        setor: r.setor,
        empresaId: r.empresaId,
        empresaNome: r.empresa.abbr ?? r.empresa.nome,
        ...campos,
        irrf: r.irrfFerias.toNumber() + irrfNormalMesAnterior,
      };
    });

  return { linhas };
}

export async function atualizarCampoIndicador(
  id: string,
  campo: CampoIndicador,
  valor: number
): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!CAMPOS_INDICADOR.includes(campo)) return { error: "Campo inválido." };
  if (Number.isNaN(valor)) return { error: "Valor inválido." };

  await prisma.indicadorMensal.update({ where: { id }, data: { [campo]: valor } });
  return { error: null };
}
