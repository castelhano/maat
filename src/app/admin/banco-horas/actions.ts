"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { funcaoNaoPodeCredito } from "@/lib/banco-horas-alertas";

export type FuncionarioOpcao = { id: string; matricula: string; nome: string };

export async function listarFuncionariosComBancoHoras(): Promise<FuncionarioOpcao[]> {
  await requireAdmin();
  return prisma.funcionario.findMany({
    where: { bancoHorasApuracoes: { some: {} } },
    select: { id: true, matricula: true, nome: true },
    orderBy: { nome: "asc" },
  });
}

export type ExtratoLinha = {
  competencia: string;
  saldoAnterior: number;
  creditoBruto: number;
  debitoBruto: number;
  aPagar: number;
  saldoAtual: number;
};

export type ExtratoResult = {
  funcionario: { matricula: string; nome: string };
  linhas: ExtratoLinha[];
};

function compararCompetencias(a: string, b: string): number {
  const [ma, aa] = a.split("/").map(Number);
  const [mb, ab] = b.split("/").map(Number);
  return aa !== ab ? aa - ab : ma - mb;
}

export type ResumoMensalLinha = {
  matricula: string;
  nome: string;
  cargo: string;
  empresa: string;
  creditoBruto: number;
  debitoBruto: number;
  pagoNoMes: number;
  saldoFinal: number;
  alertaCredito: boolean;
};

export type ResumoMensalResult = {
  competencia: string;
  linhas: ResumoMensalLinha[];
  totais: { creditoBruto: number; debitoBruto: number; pagoNoMes: number; saldoPositivo: number; saldoNegativo: number };
};

export type ResumoMensalFiltros = { empresaId?: string; departamento?: string; setor?: string };

export type ResumoMensalOpcoesFiltro = {
  empresas: { id: string; nome: string }[];
  departamentos: string[];
  setores: string[];
};

export async function listarOpcoesFiltroResumoMensal(): Promise<ResumoMensalOpcoesFiltro> {
  await requireAdmin();

  const [empresas, cargos] = await Promise.all([
    prisma.empresa.findMany({
      where: { funcionarios: { some: { bancoHorasApuracoes: { some: {} } } } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    prisma.cargo.findMany({
      where: { funcionarios: { some: { bancoHorasApuracoes: { some: {} } } } },
      select: { departamento: true, setor: true },
    }),
  ]);

  const departamentos = [...new Set(cargos.map((c) => c.departamento).filter((v): v is string => !!v))].sort();
  const setores = [...new Set(cargos.map((c) => c.setor).filter((v): v is string => !!v))].sort();

  return { empresas, departamentos, setores };
}

export async function buscarResumoMensal(
  competencia: string,
  filtros?: ResumoMensalFiltros
): Promise<{ data: ResumoMensalResult | null; error: string | null }> {
  await requireAdmin();

  if (!competencia) return { data: null, error: "Selecione a competência." };

  const apuracoes = await prisma.bancoHorasApuracao.findMany({
    where: {
      competencia,
      funcionario: {
        empresaId: filtros?.empresaId || undefined,
        cargo: {
          departamento: filtros?.departamento || undefined,
          setor: filtros?.setor || undefined,
        },
      },
    },
    include: {
      funcionario: {
        select: {
          matricula: true,
          nome: true,
          temGratificacao: true,
          cargo: { select: { nome: true } },
          empresa: { select: { nome: true, abbr: true } },
        },
      },
    },
  });

  if (apuracoes.length === 0) {
    return { data: null, error: `Nenhuma apuração encontrada para ${competencia} com esses filtros.` };
  }

  const linhas: ResumoMensalLinha[] = apuracoes
    .map((a) => {
      const creditoBruto = Number(a.creditoBruto);
      return {
        matricula: a.funcionario.matricula,
        nome: a.funcionario.nome,
        cargo: a.funcionario.cargo.nome,
        empresa: a.funcionario.empresa.abbr ?? a.funcionario.empresa.nome,
        creditoBruto,
        debitoBruto: Number(a.debitoBruto),
        pagoNoMes: Number(a.pagoNoMes),
        saldoFinal: Number(a.saldoFinal),
        alertaCredito: creditoBruto > 0.001 && funcaoNaoPodeCredito(a.funcionario.cargo.nome, a.funcionario.temGratificacao),
      };
    })
    .sort((a, b) => a.matricula.localeCompare(b.matricula));

  const totais = linhas.reduce(
    (acc, l) => ({
      creditoBruto: acc.creditoBruto + l.creditoBruto,
      debitoBruto: acc.debitoBruto + l.debitoBruto,
      pagoNoMes: acc.pagoNoMes + l.pagoNoMes,
      saldoPositivo: acc.saldoPositivo + Math.max(l.saldoFinal, 0),
      saldoNegativo: acc.saldoNegativo + Math.min(l.saldoFinal, 0),
    }),
    { creditoBruto: 0, debitoBruto: 0, pagoNoMes: 0, saldoPositivo: 0, saldoNegativo: 0 }
  );

  return { data: { competencia, linhas, totais }, error: null };
}

export async function buscarExtratoColaborador(
  funcionarioId: string,
  competenciaInicio: string,
  competenciaFim: string
): Promise<{ data: ExtratoResult | null; error: string | null }> {
  await requireAdmin();

  const funcionario = await prisma.funcionario.findUnique({
    where: { id: funcionarioId },
    select: { matricula: true, nome: true },
  });
  if (!funcionario) return { data: null, error: "Funcionário não encontrado." };

  if (compararCompetencias(competenciaInicio, competenciaFim) > 0) {
    return { data: null, error: "A competência inicial não pode ser depois da final." };
  }

  const saldoInicial = await prisma.bancoHorasSaldoInicial.findUnique({ where: { funcionarioId } });
  const apuracoes = await prisma.bancoHorasApuracao.findMany({ where: { funcionarioId } });
  apuracoes.sort((a, b) => compararCompetencias(a.competencia, b.competencia));

  // Saldo anterior de cada linha = saldo final da competência de fechamento anterior (ou o saldo
  // de abertura de dez/2025 pra primeira competência processada) — por isso calculamos sobre o
  // histórico completo antes de recortar pro período pedido.
  let anterior = saldoInicial ? Number(saldoInicial.saldoDecimal) : 0;
  const todasLinhas: ExtratoLinha[] = apuracoes.map((a) => {
    const linha: ExtratoLinha = {
      competencia: a.competencia,
      saldoAnterior: anterior,
      creditoBruto: Number(a.creditoBruto),
      debitoBruto: Number(a.debitoBruto),
      aPagar: Number(a.pagoNoMes),
      saldoAtual: Number(a.saldoFinal),
    };
    anterior = Number(a.saldoFinal);
    return linha;
  });

  const linhas = todasLinhas.filter(
    (l) =>
      compararCompetencias(l.competencia, competenciaInicio) >= 0 &&
      compararCompetencias(l.competencia, competenciaFim) <= 0
  );

  if (linhas.length === 0) {
    return {
      data: null,
      error: `Nenhuma apuração de banco de horas para ${funcionario.nome} entre ${competenciaInicio} e ${competenciaFim}.`,
    };
  }

  return { data: { funcionario, linhas }, error: null };
}
