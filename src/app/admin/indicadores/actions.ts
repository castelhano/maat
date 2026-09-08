"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  CAMPOS_INDICADOR,
  RATEIO_CAMPOS,
  chaveCompetencia,
  competenciaAnterior,
  type CampoIndicador,
  type CampoRateio,
} from "@/lib/indicadores";

const DESDE_COMPETENCIA = "01/2026";

export type IndicadorLinha = {
  id: string;
  competencia: string;
  setor: string;
  empresaId: string;
  empresaNome: string;
  // IRRF "do mês", já combinado (não é um campo cru — ver comentário abaixo).
  irrf: number;
  // Valor total de cada campo de RATEIO_CAMPOS naquela empresa+competência (o que foi editado em
  // RateioTotalCampo) — só pra mostrar de onde veio o valor já rateado por área.
  totaisRateio: Record<CampoRateio, number>;
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

  // Os campos de RATEIO_CAMPOS são rateados por área a partir de um valor TOTAL da empresa (ver
  // RateioTotalCampo) — o rateio precisa do total de ativos de TODAS as áreas da empresa naquela
  // competência, então busca sem o filtro de área (senão o total ficaria incompleto quando uma
  // área específica está selecionada na tela).
  const registrosTodasAreas = filtro.setor
    ? await prisma.indicadorMensal.findMany({
        where: { ...(filtro.empresaId ? { empresaId: filtro.empresaId } : {}) },
        select: { empresaId: true, competencia: true, ativos: true },
      })
    : registros;

  const totalAtivosPorChave = new Map<string, number>();
  for (const r of registrosTodasAreas) {
    const chave = `${r.empresaId}|${r.competencia}`;
    totalAtivosPorChave.set(chave, (totalAtivosPorChave.get(chave) ?? 0) + r.ativos);
  }

  const rateiosTotais = await prisma.rateioTotalCampo.findMany({
    where: { ...(filtro.empresaId ? { empresaId: filtro.empresaId } : {}) },
  });
  const rateioTotalPorChave = new Map<string, number>();
  for (const p of rateiosTotais) {
    rateioTotalPorChave.set(`${p.empresaId}|${p.competencia}|${p.campo}`, p.valor.toNumber());
  }

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

      // RATEIO_CAMPOS não são mais editados por área — cada um é rateado a partir do valor total
      // da empresa (editável em RateioTotalCampo): ativos da área / total de ativos da empresa ×
      // valor total.
      const chave = `${r.empresaId}|${r.competencia}`;
      const totalAtivos = totalAtivosPorChave.get(chave) ?? 0;
      const totaisRateio = {} as Record<CampoRateio, number>;
      for (const campo of RATEIO_CAMPOS) {
        const totalValor = rateioTotalPorChave.get(`${chave}|${campo}`) ?? 0;
        totaisRateio[campo] = totalValor;
        campos[campo] = totalAtivos > 0 ? (r.ativos / totalAtivos) * totalValor : 0;
      }

      return {
        id: r.id,
        competencia: r.competencia,
        setor: r.setor,
        empresaId: r.empresaId,
        empresaNome: r.empresa.abbr ?? r.empresa.nome,
        ...campos,
        irrf: r.irrfFerias.toNumber() + irrfNormalMesAnterior,
        totaisRateio,
      };
    });

  // "Aprendizes ativos" dos meses ANTERIORES ao atual não tem como vir do cadastro (que só reflete
  // hoje) nem do relatório de admitidos/desligados (que só traz eventos, não headcount) — mas dá
  // pra reconstruir andando pra trás a partir do mês mais recente conhecido: ativos do mês anterior
  // = ativos deste mês - admitidos deste mês + desligados deste mês. Só funciona sem buracos (cada
  // competência precisa ter o Resumo Gerencial + o relatório de admitidos/desligados importados) —
  // onde faltar, o valor herdado fica sem correção retroativa a partir dali.
  if (setorAprendiz) {
    const porEmpresa = new Map<string, IndicadorLinha[]>();
    for (const l of linhas) {
      if (l.setor !== setorAprendiz) continue;
      const arr = porEmpresa.get(l.empresaId) ?? [];
      arr.push(l);
      porEmpresa.set(l.empresaId, arr);
    }
    for (const arr of porEmpresa.values()) {
      // `linhas` já está ordenado cronologicamente — arr preserva essa ordem.
      for (let i = arr.length - 2; i >= 0; i--) {
        const atual = arr[i];
        const seguinte = arr[i + 1];
        atual.aprendizesAtivos = Math.max(
          0,
          seguinte.aprendizesAtivos - seguinte.aprendizesAdmitidos + seguinte.aprendizesDesligados
        );
      }
    }
  }

  return { linhas };
}

export async function carregarRateioTotal(
  empresaId: string,
  competencia: string,
  campo: CampoRateio
): Promise<{ valor: number }> {
  await requireAdmin();
  const registro = await prisma.rateioTotalCampo.findUnique({
    where: { empresaId_competencia_campo: { empresaId, competencia, campo } },
  });
  return { valor: registro?.valor.toNumber() ?? 0 };
}

export async function atualizarRateioTotal(
  empresaId: string,
  competencia: string,
  campo: CampoRateio,
  valor: number
): Promise<{ error: string | null }> {
  await requireAdmin();
  if (!RATEIO_CAMPOS.includes(campo)) return { error: "Campo inválido." };
  if (Number.isNaN(valor) || valor < 0) return { error: "Valor inválido." };

  await prisma.rateioTotalCampo.upsert({
    where: { empresaId_competencia_campo: { empresaId, competencia, campo } },
    create: { empresaId, competencia, campo, valor },
    update: { valor },
  });
  return { error: null };
}

export async function atualizarCampoIndicador(
  id: string,
  campo: CampoIndicador,
  valor: number
): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!CAMPOS_INDICADOR.includes(campo)) return { error: "Campo inválido." };
  if (RATEIO_CAMPOS.includes(campo as CampoRateio)) {
    return { error: "Esse campo não é mais editado por área — edite o valor total da empresa (rateio é automático)." };
  }
  if (Number.isNaN(valor)) return { error: "Valor inválido." };

  await prisma.indicadorMensal.update({ where: { id }, data: { [campo]: valor } });
  return { error: null };
}
