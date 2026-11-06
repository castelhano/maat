"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";
import { logAction } from "@/lib/audit";
import type { ConsignadoParseResult, ContratoConsignado } from "@/lib/parsers/econsignado";
import type { FuncionarioFolha } from "@/lib/parsers/folha-pagamento";
import { compararConsignado, STATUS_SITUACAO, type LinhaConsignado } from "@/lib/folha/consignado";

const consignadoSchema = z.object({
  competencia: z.string().regex(/^\d{2}\/\d{4}$/),
  razaoSocial: z.string().max(300),
  cnpj: z.string().regex(/^\d{14}$/),
  contratos: z
    .array(
      z.object({
        banco: z.string().max(200),
        contrato: z.string().max(60),
        cpf: z.string().regex(/^\d{11}$/),
        nome: z.string().max(200),
        inicioDesconto: z.string().max(7),
        fimDesconto: z.string().max(7),
        totalParcelas: z.number().int().min(0).max(1000),
        valorParcela: z.number().finite().min(0),
        valorEmprestimo: z.number().finite().min(0),
      }),
    )
    .min(1)
    .max(20000),
});

const soDigitos = (cpf: string) => cpf.replace(/\D/g, "").padStart(11, "0");

// O arquivo não traz o código da empresa: ela é a dona dos CPFs (todos são funcionários dela).
async function identificarEmpresa(contratos: { cpf: string }[]) {
  const cpfs = [...new Set(contratos.map((c) => c.cpf))];
  const funcionarios = await prisma.funcionario.findMany({
    where: { cpf: { not: null } },
    select: { cpf: true, empresaId: true },
  });
  const empresaPorCpf = new Map(funcionarios.map((f) => [soDigitos(f.cpf!), f.empresaId]));
  const contagem = new Map<string, number>();
  for (const cpf of cpfs) {
    const e = empresaPorCpf.get(cpf);
    if (e) contagem.set(e, (contagem.get(e) ?? 0) + 1);
  }
  const [empresaId] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!empresaId) return null;
  return prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, nome: true, abbr: true } });
}

async function matriculasPorCpf(empresaId: string) {
  const funcionarios = await prisma.funcionario.findMany({
    where: { empresaId, cpf: { not: null } },
    select: { cpf: true, matricula: true },
  });
  return new Map(funcionarios.map((f) => [soDigitos(f.cpf!), f.matricula.padStart(6, "0")]));
}

async function folhaMensal(empresaId: string, competencia: string): Promise<FuncionarioFolha[] | null> {
  const folha = await prisma.folhaPagamento.findUnique({
    where: { empresaId_competencia_tipo: { empresaId, competencia, tipo: "mensal" } },
    include: { itens: true },
  });
  if (!folha) return null;
  return folha.itens.map((i) => ({
    matricula: i.matricula,
    nome: i.nome,
    funcao: i.funcao,
    situacao: i.situacao,
    divisao: i.divisao,
    salarioBase: Number(i.salarioBase),
    admissao: i.admissao,
    gozoInicio: i.gozoInicio,
    gozoFim: i.gozoFim,
    eventos: JSON.parse(i.eventos),
  }));
}

export type ResumoConsignado = { pessoas: number; ok: number; alerta: number; erro: number; pendente: number; naoDescontado: number };

function resumir(linhas: LinhaConsignado[]): ResumoConsignado {
  const r: ResumoConsignado = { pessoas: linhas.length, ok: 0, alerta: 0, erro: 0, pendente: 0, naoDescontado: 0 };
  for (const l of linhas) {
    r[STATUS_SITUACAO[l.situacao]]++;
    r.naoDescontado += l.naoDescontado;
  }
  r.naoDescontado = Math.round(r.naoDescontado * 100) / 100;
  return r;
}

export type PreviewConsignado = {
  empresaNome: string;
  competencia: string;
  contratos: number;
  pessoas: number;
  totalParcelas: number;
  jaImportado: boolean;
  // null quando a folha mensal da competência ainda não foi importada.
  resumo: ResumoConsignado | null;
};

export async function previewConsignado(dados: ConsignadoParseResult): Promise<{ data: PreviewConsignado | null; error: string | null }> {
  await requirePermissao("folha", "operar");
  const parsed = consignadoSchema.safeParse(dados);
  if (!parsed.success) return { data: null, error: "O conteúdo do arquivo do e-Consignado não está no formato esperado." };
  const arq = parsed.data;

  const empresa = await identificarEmpresa(arq.contratos);
  if (!empresa)
    return { data: null, error: "Nenhum CPF do arquivo foi encontrado no cadastro de funcionários — importe o cadastro antes." };

  const [existente, folha, mapa] = await Promise.all([
    prisma.consignadoImportacao.findUnique({
      where: { empresaId_competencia: { empresaId: empresa.id, competencia: arq.competencia } },
      select: { id: true },
    }),
    folhaMensal(empresa.id, arq.competencia),
    matriculasPorCpf(empresa.id),
  ]);

  return {
    data: {
      empresaNome: empresa.abbr || empresa.nome,
      competencia: arq.competencia,
      contratos: arq.contratos.length,
      pessoas: new Set(arq.contratos.map((c) => c.cpf)).size,
      totalParcelas: Math.round(arq.contratos.reduce((a, c) => a + c.valorParcela, 0) * 100) / 100,
      jaImportado: existente !== null,
      resumo: folha ? resumir(compararConsignado(arq.contratos, folha, mapa, arq.competencia)) : null,
    },
    error: null,
  };
}

export async function confirmarConsignado(
  dados: ConsignadoParseResult,
  nomeArquivo: string,
): Promise<{ error: string | null; empresaId?: string; competencia?: string }> {
  const user = await requirePermissao("folha", "operar");
  const parsed = consignadoSchema.safeParse(dados);
  if (!parsed.success) return { error: "O conteúdo do arquivo do e-Consignado não está no formato esperado." };
  const arq = parsed.data;
  const empresa = await identificarEmpresa(arq.contratos);
  if (!empresa) return { error: "Nenhum CPF do arquivo foi encontrado no cadastro de funcionários." };

  await prisma.$transaction(async (tx) => {
    await tx.consignadoImportacao.deleteMany({ where: { empresaId: empresa.id, competencia: arq.competencia } });
    await tx.consignadoImportacao.create({
      data: {
        empresaId: empresa.id,
        competencia: arq.competencia,
        razaoSocial: arq.razaoSocial.slice(0, 300),
        cnpj: arq.cnpj,
        nomeArquivo: nomeArquivo.slice(0, 200),
        importadoPorId: user.id,
        contratos: { create: arq.contratos },
      },
    });
    await tx.importacao.create({
      data: {
        empresaId: empresa.id,
        tipo: "econsignado",
        importadoPorId: user.id,
        nomeArquivo: nomeArquivo.slice(0, 200),
        competencia: arq.competencia,
        criados: arq.contratos.length,
        atualizados: 0,
      },
    });
  });
  await logAction(user.id, "econsignado.importar", empresa.id, {
    competencia: arq.competencia,
    contratos: arq.contratos.length,
    nomeArquivo,
  });
  return { error: null, empresaId: empresa.id, competencia: arq.competencia };
}

export type ComparativoConsignado = {
  importado: boolean;
  folhaImportada: boolean;
  nomeArquivo: string | null;
  importadoEm: string | null;
  resumo: ResumoConsignado | null;
  linhas: LinhaConsignado[];
};

async function carregarComparativo(empresaId: string, competencia: string) {
  const importacao = await prisma.consignadoImportacao.findUnique({
    where: { empresaId_competencia: { empresaId, competencia } },
    include: { contratos: true },
  });
  if (!importacao) return { importacao: null, folha: null, linhas: [] as LinhaConsignado[] };
  const contratos: ContratoConsignado[] = importacao.contratos.map((c) => ({
    banco: c.banco,
    contrato: c.contrato,
    cpf: c.cpf,
    nome: c.nome,
    inicioDesconto: c.inicioDesconto,
    fimDesconto: c.fimDesconto,
    totalParcelas: c.totalParcelas,
    valorParcela: Number(c.valorParcela),
    valorEmprestimo: Number(c.valorEmprestimo),
  }));
  const [folha, mapa] = await Promise.all([folhaMensal(empresaId, competencia), matriculasPorCpf(empresaId)]);
  return { importacao, folha, linhas: folha ? compararConsignado(contratos, folha, mapa, competencia) : [] };
}

export async function buscarComparativoConsignado(empresaId: string, competencia: string): Promise<ComparativoConsignado> {
  await requirePermissao("folha", "consultar");
  const { importacao, folha, linhas } = await carregarComparativo(empresaId, competencia);
  return {
    importado: importacao !== null,
    folhaImportada: folha !== null,
    nomeArquivo: importacao?.nomeArquivo ?? null,
    importadoEm: importacao?.updatedAt.toISOString() ?? null,
    resumo: importacao && folha ? resumir(linhas) : null,
    linhas,
  };
}

export type DadosTermoConsignado = {
  razaoSocial: string;
  cnpj: string;
  competencia: string;
  linha: LinhaConsignado;
  cpf: string;
  funcao: string;
};

// Dados para o termo de ciência de um colaborador (identificado pelo CPF do arquivo).
export async function buscarTermoConsignado(empresaId: string, competencia: string, cpf: string): Promise<DadosTermoConsignado | null> {
  await requirePermissao("folha", "consultar");
  const { importacao, linhas } = await carregarComparativo(empresaId, competencia);
  const linha = linhas.find((l) => l.cpf === cpf);
  if (!importacao || !linha) return null;
  return {
    razaoSocial: importacao.razaoSocial,
    cnpj: importacao.cnpj,
    competencia,
    linha,
    cpf,
    funcao: linha.funcao,
  };
}
