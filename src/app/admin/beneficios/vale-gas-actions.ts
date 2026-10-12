"use server";

import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";
import { primeiraPalavra } from "@/lib/utils";
import { competenciaEstaFechada } from "@/lib/competencia";
import { calcularElegibilidadeValeGas, periodoAquisitivoValeGas, resolverHeranca, valeGasEhMesDeEntrega } from "@/lib/beneficios";

export type ApuracaoValeGasItemDTO = {
  tipo: string;
  matricula: string | null;
  nome: string;
  cargo: string | null;
  area: string | null;
  dataAdmissao: string | null;
  empresaId: string;
  empresaNome: string;
  empresaAbbr: string;
  elegivel: boolean;
  motivoPerda: string | null;
  pecunia: boolean;
  documento: string | null;
  nomeCompleto: string | null;
};

export type ApuracaoValeGasResumo = {
  competencia: string;
  periodoInicio: string;
  periodoFim: string;
  geradoEm: string | null;
  valorEntregaPorEmpresa: { empresaId: string; empresaNome: string; valorEntrega: number | null }[];
  itens: ApuracaoValeGasItemDTO[];
};

function parseCompetencia(competencia: string): { ano: number; mes: number } {
  const [mes, ano] = competencia.split("/").map(Number);
  return { ano, mes };
}

export async function carregarApuracaoValeGas(competencia: string): Promise<ApuracaoValeGasResumo | null> {
  await requirePermissao("beneficios", "consultar");
  if (!competencia.trim()) return null;
  const { ano, mes } = parseCompetencia(competencia);
  if (!valeGasEhMesDeEntrega(mes)) return null;
  const periodo = periodoAquisitivoValeGas({ ano, mes });

  const apuracoes = await prisma.apuracaoValeGas.findMany({
    where: { competencia },
    include: { itens: true, empresa: true },
    orderBy: { empresa: { nome: "asc" } },
  });

  const periodoInicio = periodo.inicio.toISOString();
  const periodoFim = periodo.fim.toISOString();

  if (apuracoes.length === 0) {
    return { competencia, periodoInicio, periodoFim, geradoEm: null, valorEntregaPorEmpresa: [], itens: [] };
  }

  const geradoEm = apuracoes.reduce<Date | null>((acc, a) => (a.geradoEm && (!acc || a.geradoEm > acc) ? a.geradoEm : acc), null);

  const cargos = await prisma.cargo.findMany({ select: { nome: true, setor: true } });
  const setorPorCargo = new Map(cargos.map((c) => [c.nome, c.setor]));

  // CPF/documento e nome completo não ficam salvos no snapshot — busca no cadastro atual (via
  // funcionarioId/terceiroId), mesmo padrão usado em carregarApuracao (cesta/VA).
  const todosFuncionarioIds = apuracoes.flatMap((a) => a.itens.map((i) => i.funcionarioId).filter((id): id is string => !!id));
  const todosTerceiroIds = apuracoes.flatMap((a) => a.itens.map((i) => i.terceiroId).filter((id): id is string => !!id));
  const funcionariosCpf = await prisma.funcionario.findMany({
    where: { id: { in: todosFuncionarioIds } },
    select: { id: true, cpf: true, nomeCompleto: true },
  });
  const terceirosDoc = await prisma.terceiro.findMany({
    where: { id: { in: todosTerceiroIds } },
    select: { id: true, documento: true },
  });
  const cpfPorFuncionarioId = new Map(funcionariosCpf.map((f) => [f.id, f.cpf]));
  const nomeCompletoPorFuncionarioId = new Map(funcionariosCpf.map((f) => [f.id, f.nomeCompleto]));
  const docPorTerceiroId = new Map(terceirosDoc.map((t) => [t.id, t.documento]));

  const itens: ApuracaoValeGasItemDTO[] = apuracoes.flatMap((a) =>
    a.itens.map((i) => ({
      tipo: i.tipo,
      matricula: i.matricula,
      nome: i.nome,
      cargo: i.cargo,
      area: i.cargo ? (setorPorCargo.get(i.cargo) ?? null) : null,
      dataAdmissao: i.dataAdmissao ? i.dataAdmissao.toISOString() : null,
      empresaId: a.empresaId,
      empresaNome: a.empresa.nome,
      empresaAbbr: a.empresa.abbr || primeiraPalavra(a.empresa.nome),
      elegivel: i.elegivel,
      motivoPerda: i.motivoPerda,
      pecunia: i.pecunia,
      documento: i.funcionarioId
        ? (cpfPorFuncionarioId.get(i.funcionarioId) ?? null)
        : i.terceiroId
          ? (docPorTerceiroId.get(i.terceiroId) ?? null)
          : null,
      nomeCompleto: i.funcionarioId ? (nomeCompletoPorFuncionarioId.get(i.funcionarioId) ?? null) : null,
    }))
  );

  const valorEntregaPorEmpresa = apuracoes.map((a) => ({
    empresaId: a.empresaId,
    empresaNome: a.empresa.nome,
    valorEntrega: a.valorEntrega?.toNumber() ?? null,
  }));

  return { competencia, periodoInicio, periodoFim, geradoEm: geradoEm ? geradoEm.toISOString() : null, valorEntregaPorEmpresa, itens };
}

export async function processarApuracaoValeGas(
  competencia: string,
  empresaId?: string
): Promise<{ error: string | null; resumo?: { empresas: number; itens: number } }> {
  const admin = await requirePermissao("beneficios", "operar");
  if (!competencia.trim()) return { error: "Selecione a competência." };

  const { ano, mes } = parseCompetencia(competencia);
  if (!valeGasEhMesDeEntrega(mes)) {
    return { error: "Vale Gás só é apurado em meses pares (a entrega acontece em fevereiro, abril, junho, agosto, outubro e dezembro)." };
  }
  if (competenciaEstaFechada({ ano, mes })) {
    return {
      error: `A competência ${competencia} já está fechada pra reprocessamento (o prazo vai até o dia 7 do mês seguinte). Se precisar corrigir algum valor específico, peça ajuste manual em vez de reprocessar.`,
    };
  }

  const periodo = periodoAquisitivoValeGas({ ano, mes });
  const empresas = await prisma.empresa.findMany({ where: empresaId ? { id: empresaId } : undefined });

  let empresasProcessadas = 0;
  let itensTotal = 0;

  for (const empresa of empresas) {
    const funcionarios = await prisma.funcionario.findMany({ where: { empresaId: empresa.id }, include: { cargo: true } });
    const terceiros = await prisma.terceiro.findMany({ where: { empresaId: empresa.id, ativo: true } });

    // Só a ocorrência "FALTA" conta (mesma regra da cesta básica), mas aqui somada ao longo do
    // período aquisitivo inteiro (~60 dias), não só um mês.
    const faltasAgrupadas = await prisma.falta.groupBy({
      by: ["funcionarioId"],
      where: { funcionarioId: { in: funcionarios.map((f) => f.id) }, data: { gte: periodo.inicio, lte: periodo.fim }, ocorrencia: "FALTA" },
      _count: { _all: true },
    });
    const faltasPorFuncionario = new Map(faltasAgrupadas.map((f) => [f.funcionarioId, f._count._all]));

    const historicoAfastamentos = await prisma.afastamentoHistorico.findMany({
      where: { funcionarioId: { in: funcionarios.map((f) => f.id) } },
      select: { funcionarioId: true, dataInicio: true, dataFim: true },
    });
    const periodosPorFuncionario = new Map<string, { inicio: Date; fim: Date | null }[]>();
    for (const h of historicoAfastamentos) {
      const lista = periodosPorFuncionario.get(h.funcionarioId) ?? [];
      lista.push({ inicio: h.dataInicio, fim: h.dataFim });
      periodosPorFuncionario.set(h.funcionarioId, lista);
    }

    const itens: {
      tipo: string;
      funcionarioId: string | null;
      terceiroId: string | null;
      matricula: string | null;
      nome: string;
      cargo: string | null;
      dataAdmissao: Date | null;
      elegivel: boolean;
      motivoPerda: string | null;
      pecunia: boolean;
    }[] = [];

    for (const f of funcionarios) {
      const recebeCestaBasicaResolvido = resolverHeranca(f.recebeCestaBasica, f.cargo.recebeCestaBasica);
      const recebeValeGasResolvido = resolverHeranca(f.recebeValeGas, recebeCestaBasicaResolvido);
      const resultado = calcularElegibilidadeValeGas(
        {
          dataAdmissao: f.dataAdmissao,
          dataDesligamento: f.dataDesligamento,
          periodosAfastamento: periodosPorFuncionario.get(f.id) ?? [],
          faltasNoPeriodo: faltasPorFuncionario.get(f.id) ?? 0,
          recebeValeGasResolvido,
          pecunia: f.valeGasPecunia,
        },
        periodo,
        { ano, mes }
      );
      itens.push({
        tipo: "funcionario",
        funcionarioId: f.id,
        terceiroId: null,
        matricula: f.matricula,
        nome: f.nome,
        cargo: f.cargo.nome,
        dataAdmissao: f.dataAdmissao,
        elegivel: resultado.elegivel,
        motivoPerda: resultado.motivo,
        pecunia: f.valeGasPecunia,
      });
    }

    for (const t of terceiros) {
      const recebeValeGasResolvido = resolverHeranca(t.recebeValeGas, t.recebeCestaBasica);
      const elegivel = recebeValeGasResolvido && !t.valeGasPecunia;
      const motivoPerda = !recebeValeGasResolvido
        ? "Terceiro sem vale gás (manual)"
        : t.valeGasPecunia
          ? "Convertida em Pecúnia"
          : null;
      itens.push({
        tipo: "terceiro",
        funcionarioId: null,
        terceiroId: t.id,
        matricula: null,
        nome: t.nome,
        cargo: null,
        dataAdmissao: null,
        elegivel,
        motivoPerda,
        pecunia: t.valeGasPecunia,
      });
    }

    if (itens.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await tx.apuracaoValeGas.deleteMany({ where: { empresaId: empresa.id, competencia } });
      await tx.apuracaoValeGas.create({
        data: {
          empresaId: empresa.id,
          competencia,
          geradoPorId: admin.id,
          geradoEm: new Date(),
          itens: { create: itens },
        },
      });
    });

    empresasProcessadas++;
    itensTotal += itens.length;
  }

  return { error: null, resumo: { empresas: empresasProcessadas, itens: itensTotal } };
}

// O valor da entrega é o mesmo pras 3 empresas (orçamento único por competência), então um só
// preenchimento grava em todas as apurações já processadas dessa competência de uma vez.
export async function salvarValorEntregaValeGas(competencia: string, valor: number | null): Promise<{ error: string | null }> {
  await requirePermissao("beneficios", "operar");
  const apuracoes = await prisma.apuracaoValeGas.findMany({ where: { competencia } });
  if (apuracoes.length === 0) {
    return { error: "Processe essa competência antes de registrar o valor da entrega." };
  }
  await prisma.apuracaoValeGas.updateMany({ where: { competencia }, data: { valorEntrega: valor } });
  return { error: null };
}
