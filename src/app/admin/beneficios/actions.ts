"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { primeiraPalavra } from "@/lib/utils";
import { competenciaEstaFechada } from "@/lib/competencia";
import {
  calcularElegibilidadeCesta,
  calcularVR,
  calcularValorCestaConvertida,
  resolverHeranca,
  statusNaCompetencia,
} from "@/lib/beneficios";

export type ApuracaoItemDTO = {
  tipo: string;
  matricula: string | null;
  documento: string | null;
  nome: string;
  nomeCompleto: string | null;
  cargo: string | null;
  area: string | null;
  salario: number | null;
  dataAdmissao: string | null;
  empresaId: string;
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
  geradoCestaEm: string | null;
  geradoVrEm: string | null;
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

  if (apuracoes.length === 0) return { competencia, geradoCestaEm: null, geradoVrEm: null, itens: [] };

  function maisRecente(pegar: (a: (typeof apuracoes)[number]) => Date | null): Date | null {
    return apuracoes.reduce<Date | null>((acc, a) => {
      const v = pegar(a);
      return v && (!acc || v > acc) ? v : acc;
    }, null);
  }
  const geradoCestaEm = maisRecente((a) => a.geradoCestaEm);
  const geradoVrEm = maisRecente((a) => a.geradoVrEm);

  // Área/setor não fica salva no snapshot da apuração (ApuracaoItem guarda só o nome do cargo);
  // busca no cadastro atual de Cargo pra não precisar de migração nem reprocessar apurações antigas.
  const cargos = await prisma.cargo.findMany({ select: { nome: true, setor: true } });
  const setorPorCargo = new Map(cargos.map((c) => [c.nome, c.setor]));

  // CPF/documento também não fica salvo no snapshot — busca no cadastro atual (via
  // funcionarioId/terceiroId) pra gerar o arquivo bancário sem precisar reprocessar.
  const funcionarioIds = apuracoes.flatMap((a) => a.itens.map((i) => i.funcionarioId).filter((id) => id !== null));
  const terceiroIds = apuracoes.flatMap((a) => a.itens.map((i) => i.terceiroId).filter((id) => id !== null));
  const funcionariosCpf = await prisma.funcionario.findMany({
    where: { id: { in: funcionarioIds } },
    select: { id: true, cpf: true, nomeCompleto: true },
  });
  const terceirosDoc = await prisma.terceiro.findMany({
    where: { id: { in: terceiroIds } },
    select: { id: true, documento: true },
  });
  const cpfPorFuncionarioId = new Map(funcionariosCpf.map((f) => [f.id, f.cpf]));
  const nomeCompletoPorFuncionarioId = new Map(funcionariosCpf.map((f) => [f.id, f.nomeCompleto]));
  const docPorTerceiroId = new Map(terceirosDoc.map((t) => [t.id, t.documento]));

  const itens: ApuracaoItemDTO[] = apuracoes.flatMap((a) =>
    a.itens.map((i) => ({
      tipo: i.tipo,
      matricula: i.matricula,
      documento: i.funcionarioId
        ? (cpfPorFuncionarioId.get(i.funcionarioId) ?? null)
        : i.terceiroId
          ? (docPorTerceiroId.get(i.terceiroId) ?? null)
          : null,
      nome: i.nome,
      nomeCompleto: i.funcionarioId ? (nomeCompletoPorFuncionarioId.get(i.funcionarioId) ?? null) : null,
      cargo: i.cargo,
      area: i.cargo ? (setorPorCargo.get(i.cargo) ?? null) : null,
      salario: i.salario?.toNumber() ?? null,
      dataAdmissao: i.dataAdmissao ? i.dataAdmissao.toISOString() : null,
      empresaId: a.empresaId,
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

  return {
    competencia,
    geradoCestaEm: geradoCestaEm ? geradoCestaEm.toISOString() : null,
    geradoVrEm: geradoVrEm ? geradoVrEm.toISOString() : null,
    itens,
  };
}

export type DimensaoApuracao = "cesta" | "vr";

export async function processarApuracao(
  competencia: string,
  dimensao: DimensaoApuracao,
  empresaId?: string
): Promise<{ error: string | null; resumo?: { empresas: number; itens: number } }> {
  const admin = await requireAdmin();
  if (!competencia.trim()) return { error: "Selecione a competência." };

  const { ano, mes } = parseCompetencia(competencia);

  if (competenciaEstaFechada({ ano, mes })) {
    return {
      error: `A competência ${competencia} já está fechada pra reprocessamento (o prazo vai até o dia 7 do mês seguinte). Se precisar corrigir algum valor específico, peça ajuste manual em vez de reprocessar.`,
    };
  }

  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));

  // O crédito de "cesta convertida em VR" é pago com base na elegibilidade da cesta do MÊS
  // ANTERIOR (ex.: VR de agosto olha as faltas de julho) — regra específica só desse crédito;
  // a aba de Cesta Básica em si continua mostrando a elegibilidade do mês corrente normalmente.
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const inicioAnterior = new Date(Date.UTC(anoAnterior, mesAnterior - 1, 1));
  const fimAnterior = new Date(Date.UTC(anoAnterior, mesAnterior, 0, 23, 59, 59, 999));

  const empresas = await prisma.empresa.findMany({ where: empresaId ? { id: empresaId } : undefined });

  let empresasProcessadas = 0;
  let itensTotal = 0;

  for (const empresa of empresas) {
    const todosFuncionarios = await prisma.funcionario.findMany({
      where: { empresaId: empresa.id },
      include: { cargo: true },
    });
    // Desligado só entra na apuração da competência em que o desligamento aconteceu — a partir
    // do mês seguinte ele já saiu da folha de verdade, então não faz sentido continuar
    // aparecendo indefinidamente como "Desligado" em toda competência processada depois.
    const funcionarios = todosFuncionarios.filter((f) => {
      if (f.status !== "desligado" || !f.dataDesligamento) return true;
      return f.dataDesligamento.getUTCFullYear() === ano && f.dataDesligamento.getUTCMonth() + 1 === mes;
    });
    const terceiros = await prisma.terceiro.findMany({ where: { empresaId: empresa.id, ativo: true } });

    // Só a ocorrência "FALTA" (falta sem justificativa) conta pra regra de perda de benefício —
    // atestado médico, falta justificada, óbito, suspensão, paternidade e casamento são
    // afastamentos amparados, não faltas.
    const faltasAgrupadas = await prisma.falta.groupBy({
      by: ["funcionarioId"],
      where: {
        funcionarioId: { in: funcionarios.map((f) => f.id) },
        data: { gte: inicio, lte: fim },
        ocorrencia: "FALTA",
      },
      _count: { _all: true },
    });
    const faltasPorFuncionario = new Map(faltasAgrupadas.map((f) => [f.funcionarioId, f._count._all]));

    const faltasAgrupadasAnterior = await prisma.falta.groupBy({
      by: ["funcionarioId"],
      where: {
        funcionarioId: { in: funcionarios.map((f) => f.id) },
        data: { gte: inicioAnterior, lte: fimAnterior },
        ocorrencia: "FALTA",
      },
      _count: { _all: true },
    });
    const faltasPorFuncionarioAnterior = new Map(faltasAgrupadasAnterior.map((f) => [f.funcionarioId, f._count._all]));

    // Histórico completo de afastamentos (pode ter mais de um ciclo no mesmo mês, ex.: voltou
    // dia 7 e se afastou de novo dia 23) — usado pra contar os dias trabalhados corretamente, em
    // vez de só o par dataAfastamento/dataRetorno (que guarda só o ciclo mais recente).
    const historicoAfastamentos = await prisma.afastamentoHistorico.findMany({
      where: { funcionarioId: { in: funcionarios.map((f) => f.id) } },
      select: { funcionarioId: true, dataInicio: true, dataFim: true, motivo: true },
    });
    const periodosPorFuncionario = new Map<string, { inicio: Date; fim: Date | null; motivo: string | null }[]>();
    for (const h of historicoAfastamentos) {
      const lista = periodosPorFuncionario.get(h.funcionarioId) ?? [];
      lista.push({ inicio: h.dataInicio, fim: h.dataFim, motivo: h.motivo });
      periodosPorFuncionario.set(h.funcionarioId, lista);
    }

    const valorCestaBasicaEmpresa = empresa.valorCestaBasica?.toNumber() ?? null;
    // Cesta básica e vale-alimentação são fechados em datas diferentes — cada um só grava os
    // campos da sua própria dimensão, pra reprocessar um não sobrescrever o outro (ex.: apurar
    // cesta de novo não pode zerar um valor de VA já fechado, e vice-versa).
    type ItemUpsert = { chave: { funcionarioId: string | null; terceiroId: string | null }; base: Prisma.ApuracaoItemCreateWithoutApuracaoInput };
    const itens: ItemUpsert[] = [];

    for (const f of funcionarios) {
      const recebeCestaResolvido = resolverHeranca(f.recebeCestaBasica, f.cargo.recebeCestaBasica);
      const recebeVRResolvido = resolverHeranca(f.recebeValeRefeicao, f.cargo.recebeValeRefeicao);
      const periodosAfastamento = periodosPorFuncionario.get(f.id) ?? [];

      const cesta = calcularElegibilidadeCesta(
        {
          status: f.status,
          dataAdmissao: f.dataAdmissao,
          dataAfastamento: f.dataAfastamento,
          dataRetorno: f.dataRetorno,
          motivoAfastamento: f.motivoAfastamento,
          periodosAfastamento,
          faltasNoMes: faltasPorFuncionario.get(f.id) ?? 0,
          recebeCestaBasicaResolvido: recebeCestaResolvido,
        },
        { ano, mes }
      );

      // Valor individual do funcionário tem prioridade; senão usa o valor fixo do cargo (ex.:
      // motorista = 520) — mas só quando ele não tem gratificação, porque aí o cálculo tem que
      // ser o percentual sobre salário+40% (que pode passar do valor fixo do cargo), não o valor
      // fixo. Só cai pro cálculo percentual normal se nenhum dos dois existir.
      const valorValeRefeicaoResolvido =
        f.valorValeRefeicao?.toNumber() ?? (f.temGratificacao ? null : f.cargo.valorValeRefeicaoFixo?.toNumber() ?? null);

      const vr = calcularVR(
        {
          status: f.status,
          salario: f.salario.toNumber(),
          temGratificacao: f.temGratificacao,
          valorValeRefeicao: valorValeRefeicaoResolvido,
          recebeValeRefeicaoResolvido: recebeVRResolvido,
          dataAdmissao: f.dataAdmissao,
          dataAfastamento: f.dataAfastamento,
          dataRetorno: f.dataRetorno,
          dataDesligamento: f.dataDesligamento,
          periodosAfastamento,
        },
        { ano, mes }
      );

      // O crédito depende da elegibilidade da cesta no mês ANTERIOR, não neste — usa as faltas
      // reais daquele mês e corrige o status pra "ativo" se o desligamento/afastamento atual só
      // aconteceu depois (statusNaCompetencia), já que aí ele ainda estava trabalhando normal.
      const cestaMesAnterior = calcularElegibilidadeCesta(
        {
          status: statusNaCompetencia(f, { ano: anoAnterior, mes: mesAnterior }),
          dataAdmissao: f.dataAdmissao,
          dataAfastamento: f.dataAfastamento,
          dataRetorno: f.dataRetorno,
          motivoAfastamento: f.motivoAfastamento,
          periodosAfastamento,
          faltasNoMes: faltasPorFuncionarioAnterior.get(f.id) ?? 0,
          recebeCestaBasicaResolvido: recebeCestaResolvido,
        },
        { ano: anoAnterior, mes: mesAnterior }
      );

      // Só faz sentido pagar o crédito da cesta convertida se o VR do mês em si é devido — quem
      // não tem mais direito a VR (ex.: desligado antes do dia que mantém o benefício, pago em
      // verbas rescisórias em vez de VR) também não recebe esse crédito junto.
      const valorCestaConvertida = vr.elegivel
        ? calcularValorCestaConvertida({
            elegivelCesta: cestaMesAnterior.elegivel,
            recebeCestaComoVR: f.recebeCestaComoVR,
            valorCestaBasicaEmpresa,
          })
        : null;

      // Quem tem direito à cesta mas optou por receber em VR não recebe a cesta física — na aba
      // de cesta básica ele deve aparecer como "sem direito", não como se estivesse recebendo as
      // duas coisas. O valor convertido acima já foi calculado sobre a elegibilidade real.
      const cestaConvertidaComoVR = cesta.elegivel && f.recebeCestaComoVR;

      itens.push({
        chave: { funcionarioId: f.id, terceiroId: null },
        base: {
          tipo: "funcionario",
          matricula: f.matricula,
          nome: f.nome,
          cargo: f.cargo.nome,
          salario: f.salario,
          dataAdmissao: f.dataAdmissao,
          elegivelCestaBasica: cesta.elegivel && !cestaConvertidaComoVR,
          motivoPerdaCesta: cestaConvertidaComoVR ? "Cesta convertida (VA)" : cesta.motivo,
          recebeCestaComoVR: f.recebeCestaComoVR,
          valorCestaConvertida,
          elegivelVR: vr.elegivel,
          motivoPerdaVR: vr.motivo,
          baseCalculoVR: vr.baseCalculo,
          valorVR: vr.valor + (valorCestaConvertida ?? 0),
        },
      });
    }

    for (const t of terceiros) {
      const valorVRBase = t.recebeValeRefeicao ? (t.valorValeRefeicao?.toNumber() ?? 0) : 0;
      const valorCestaConvertida = calcularValorCestaConvertida({
        elegivelCesta: t.recebeCestaBasica,
        recebeCestaComoVR: t.recebeCestaComoVR,
        valorCestaBasicaEmpresa,
      });
      const cestaConvertidaComoVR = t.recebeCestaBasica && t.recebeCestaComoVR;

      itens.push({
        chave: { funcionarioId: null, terceiroId: t.id },
        base: {
          tipo: "terceiro",
          matricula: null,
          nome: t.nome,
          cargo: null,
          salario: null,
          dataAdmissao: null,
          elegivelCestaBasica: t.recebeCestaBasica && !cestaConvertidaComoVR,
          motivoPerdaCesta: cestaConvertidaComoVR
            ? "Cesta convertida (VA)"
            : t.recebeCestaBasica
              ? null
              : "Terceiro sem cesta (manual)",
          recebeCestaComoVR: t.recebeCestaComoVR,
          valorCestaConvertida,
          elegivelVR: t.recebeValeRefeicao,
          motivoPerdaVR: t.recebeValeRefeicao ? null : "Terceiro sem alimentação",
          baseCalculoVR: null,
          valorVR: valorVRBase + (valorCestaConvertida ?? 0),
        },
      });
    }

    if (itens.length === 0) continue;

    // Campos que pertencem à outra dimensão (não processada agora) só entram como valor inicial
    // se a linha ainda não existir — se já existir, o update abaixo nem toca neles.
    const camposCesta = ["elegivelCestaBasica", "motivoPerdaCesta", "recebeCestaComoVR"] as const;
    const camposVR = ["valorCestaConvertida", "elegivelVR", "motivoPerdaVR", "baseCalculoVR", "valorVR"] as const;
    const camposComuns = ["tipo", "matricula", "nome", "cargo", "salario", "dataAdmissao"] as const;
    const camposAtualizar = dimensao === "cesta" ? camposCesta : camposVR;

    await prisma.$transaction(async (tx) => {
      // Reconcilia linhas de apurações antigas (de antes dessa separação, sem funcionarioId/
      // terceiroId salvo) usando matrícula/nome, pra não duplicar a linha da pessoa.
      const apuracaoExistente = await tx.apuracao.findUnique({
        where: { empresaId_competencia: { empresaId: empresa.id, competencia } },
        include: { itens: true },
      });
      if (apuracaoExistente) {
        for (const item of apuracaoExistente.itens) {
          if (item.funcionarioId || item.terceiroId) continue;
          const correspondente = itens.find((i) =>
            item.tipo === "funcionario"
              ? i.chave.funcionarioId && i.base.matricula === item.matricula
              : i.chave.terceiroId && i.base.nome === item.nome
          );
          if (correspondente) {
            await tx.apuracaoItem.update({
              where: { id: item.id },
              data: { funcionarioId: correspondente.chave.funcionarioId, terceiroId: correspondente.chave.terceiroId },
            });
          }
        }
      }

      const apuracao =
        apuracaoExistente ??
        (await tx.apuracao.create({
          data: { empresaId: empresa.id, competencia, geradoPorId: admin.id },
        }));

      // Remove linhas de funcionário que ficaram nessa competência de um processamento antigo
      // mas que não pertencem mais a ela (ex.: desligado num mês anterior — foi corrigido pra
      // não entrar mais em competências seguintes, então a linha velha precisa sair também).
      if (apuracaoExistente) {
        const idsRelevantes = itens.map((i) => i.chave.funcionarioId).filter((id): id is string => id !== null);
        await tx.apuracaoItem.deleteMany({
          where: {
            apuracaoId: apuracao.id,
            tipo: "funcionario",
            funcionarioId: { not: null, notIn: idsRelevantes },
          },
        });
      }

      for (const { chave, base } of itens) {
        const dataAtualizar: Prisma.ApuracaoItemUpdateInput = {};
        for (const campo of [...camposComuns, ...camposAtualizar]) {
          (dataAtualizar as Record<string, unknown>)[campo] = base[campo as keyof typeof base];
        }

        if (chave.funcionarioId) {
          await tx.apuracaoItem.upsert({
            where: { apuracaoId_funcionarioId: { apuracaoId: apuracao.id, funcionarioId: chave.funcionarioId } },
            create: { apuracaoId: apuracao.id, funcionarioId: chave.funcionarioId, ...base },
            update: dataAtualizar,
          });
        } else {
          await tx.apuracaoItem.upsert({
            where: { apuracaoId_terceiroId: { apuracaoId: apuracao.id, terceiroId: chave.terceiroId! } },
            create: { apuracaoId: apuracao.id, terceiroId: chave.terceiroId, ...base },
            update: dataAtualizar,
          });
        }
      }

      await tx.apuracao.update({
        where: { id: apuracao.id },
        data: {
          geradoPorId: admin.id,
          ...(dimensao === "cesta" ? { geradoCestaEm: new Date() } : { geradoVrEm: new Date() }),
        },
      });
    });

    empresasProcessadas++;
    itensTotal += itens.length;
  }

  return { error: null, resumo: { empresas: empresasProcessadas, itens: itensTotal } };
}
