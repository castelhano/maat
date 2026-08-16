"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

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
