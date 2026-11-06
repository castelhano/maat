"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";
import { logAction } from "@/lib/audit";
import type { FolhaPagamentoParseResult, FuncionarioFolha, TipoFolha } from "@/lib/parsers/folha-pagamento";
import {
  calendarioCompetencia,
  conferirFolha,
  type BancoHorasCompetencia,
  type CalendarioCompetencia,
  type ResultadoFuncionario,
} from "@/lib/folha/conferencia";
import { conferirFolha13, type Contexto13, type MesHistorico } from "@/lib/folha/conferencia-13";

// O TXT é lido no navegador (passaria do limite de envio do servidor) e chega aqui já separado
// por funcionário — validamos o formato antes de gravar.
const eventoSchema = z.object({
  codigo: z.string().regex(/^\d{5}$/),
  descricao: z.string().max(40),
  coluna: z.enum(["provento", "desconto", "base"]),
  tipo: z.string().max(10),
  referencia: z.number().finite().nullable(),
  valor: z.number().finite(),
});

const folhaSchema = z.object({
  empresa: z.object({ codigo: z.string().regex(/^\d{3}$/), nome: z.string().max(200) }),
  competencia: z.string().regex(/^\d{2}\/\d{4}$/),
  tipo: z.enum(["mensal", "13_1", "13_2"]),
  simulado: z.boolean(),
  funcionarios: z
    .array(
      z.object({
        matricula: z.string().regex(/^\d{6}$/),
        nome: z.string().max(200),
        funcao: z.string().max(100),
        situacao: z.string().max(200),
        divisao: z.string().max(50),
        salarioBase: z.number().finite(),
        admissao: z.string().max(10),
        gozoInicio: z.string().max(10).nullable(),
        gozoFim: z.string().max(10).nullable(),
        eventos: z.array(eventoSchema).max(200),
      })
    )
    .min(1)
    .max(5000),
  resumoPorEvento: z.record(z.string(), z.number()),
});

// Horas "A Pagar" do Banco de Horas da empresa na competência, para conferir a hora extra 50% da
// folha. null quando o banco de horas desse mês ainda não foi importado.
async function carregarBancoHoras(empresaId: string, competencia: string): Promise<BancoHorasCompetencia | null> {
  const apuracoes = await prisma.bancoHorasApuracao.findMany({
    where: { competencia, funcionario: { empresaId } },
    select: { pagoNoMes: true, saldoFinal: true, funcionario: { select: { matricula: true } } },
  });
  if (apuracoes.length === 0) return null;
  return new Map(
    apuracoes.map((a) => {
      const aPagar = Number(a.pagoNoMes);
      return [a.funcionario.matricula.padStart(6, "0"), { aPagar, aPagarRescisao: aPagar + Math.max(Number(a.saldoFinal), 0) }];
    })
  );
}

type ItemGravado = {
  matricula: string;
  nome: string;
  funcao: string;
  situacao: string;
  divisao: string;
  salarioBase: { toString(): string };
  admissao: string;
  gozoInicio: string | null;
  gozoFim: string | null;
  eventos: string;
};

function paraFuncionario(i: ItemGravado): FuncionarioFolha {
  return {
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
  };
}

// Para o 13º: folhas mensais do ano (avos, médias, adiantamento pago nas férias) e, na 2ª
// parcela, a 1ª parcela do mesmo ano.
async function carregarContexto13(empresaId: string, competencia: string, tipo: "13_1" | "13_2"): Promise<Contexto13> {
  const ano = competencia.split("/")[1];
  const mensais = await prisma.folhaPagamento.findMany({
    where: { empresaId, tipo: "mensal", competencia: { endsWith: `/${ano}` } },
    include: { itens: true },
  });
  const historico = new Map<string, MesHistorico[]>();
  for (const f of mensais) {
    for (const i of f.itens) {
      const lista = historico.get(i.matricula) ?? [];
      lista.push({ competencia: f.competencia, situacao: i.situacao, gozoInicio: i.gozoInicio, gozoFim: i.gozoFim, eventos: JSON.parse(i.eventos) });
      historico.set(i.matricula, lista);
    }
  }
  let primeiraParcela: Contexto13["primeiraParcela"] = null;
  if (tipo === "13_2") {
    const primeira = await prisma.folhaPagamento.findFirst({
      where: { empresaId, tipo: "13_1", competencia: { endsWith: `/${ano}` } },
      include: { itens: true },
      orderBy: { updatedAt: "desc" },
    });
    if (primeira) primeiraParcela = new Map(primeira.itens.map((i) => [i.matricula, paraFuncionario(i)]));
  }
  return { historico, mesesImportados: new Set(mensais.map((f) => Number(f.competencia.slice(0, 2)))), primeiraParcela };
}

const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Cada contagem é de funcionários que têm pelo menos uma crítica daquele tipo (alguém com erro
// e alerta de consignado entra nas duas); "ok" é quem não tem nenhuma pendência.
export type ResumoConferencia = { total: number; erro: number; alerta: number; pendente: number; ok: number };

function resumir(resultados: ResultadoFuncionario[]): ResumoConferencia {
  const r: ResumoConferencia = { total: resultados.length, erro: 0, alerta: 0, pendente: 0, ok: 0 };
  for (const f of resultados) {
    for (const s of ["erro", "alerta", "pendente"] as const) {
      if (f.criticas.some((c) => c.status === s)) r[s]++;
    }
    if (f.status === "ok") r.ok++;
  }
  return r;
}

export type PreviewFolha = {
  empresa: { codigo: string; nome: string };
  competencia: string;
  tipo: TipoFolha;
  simulado: boolean;
  funcionarios: number;
  jaImportada: boolean;
  bancoHorasImportado: boolean;
  resumo: ResumoConferencia;
};

export async function previewFolha(
  dados: FolhaPagamentoParseResult
): Promise<{ data: PreviewFolha | null; error: string | null }> {
  await requirePermissao("folha", "operar");
  const parsed = folhaSchema.safeParse(dados);
  if (!parsed.success) return { data: null, error: "O conteúdo do arquivo não está no formato esperado." };
  const folha = parsed.data;

  const empresa = await prisma.empresa.findUnique({ where: { codigo: folha.empresa.codigo } });
  if (!empresa) {
    return {
      data: null,
      error: `Empresa ${folha.empresa.codigo} (${folha.empresa.nome}) ainda não está cadastrada — importe o cadastro dela antes.`,
    };
  }
  const existente = await prisma.folhaPagamento.findUnique({
    where: { empresaId_competencia_tipo: { empresaId: empresa.id, competencia: folha.competencia, tipo: folha.tipo } },
    select: { id: true },
  });
  let resultados: ResultadoFuncionario[];
  let bancoHoras: BancoHorasCompetencia | null = null;
  if (folha.tipo === "mensal") {
    bancoHoras = await carregarBancoHoras(empresa.id, folha.competencia);
    resultados = conferirFolha(folha.funcionarios, folha.competencia, bancoHoras).resultados;
  } else {
    const contexto = await carregarContexto13(empresa.id, folha.competencia, folha.tipo);
    resultados = conferirFolha13(folha.funcionarios, folha.competencia, folha.tipo, contexto).resultados;
  }

  return {
    data: {
      empresa: folha.empresa,
      competencia: folha.competencia,
      tipo: folha.tipo,
      simulado: folha.simulado,
      funcionarios: folha.funcionarios.length,
      jaImportada: existente !== null,
      // Só a folha mensal é conferida com o banco de horas.
      bancoHorasImportado: folha.tipo !== "mensal" || bancoHoras !== null,
      resumo: resumir(resultados),
    },
    error: null,
  };
}

export async function confirmarFolha(
  dados: FolhaPagamentoParseResult,
  nomeArquivo: string
): Promise<{ error: string | null; competencia?: string; empresaId?: string; tipo?: TipoFolha }> {
  const user = await requirePermissao("folha", "operar");
  const parsed = folhaSchema.safeParse(dados);
  if (!parsed.success) return { error: "O conteúdo do arquivo não está no formato esperado." };
  const folha = parsed.data;

  const empresa = await prisma.empresa.findUnique({ where: { codigo: folha.empresa.codigo } });
  if (!empresa) return { error: `Empresa ${folha.empresa.codigo} não está cadastrada.` };

  await prisma.$transaction(async (tx) => {
    // Reimportar substitui a folha inteira da competência e do tipo (itens caem junto, em
    // cascata) — o 13º não mexe na folha mensal do mesmo mês.
    await tx.folhaPagamento.deleteMany({ where: { empresaId: empresa.id, competencia: folha.competencia, tipo: folha.tipo } });
    await tx.folhaPagamento.create({
      data: {
        empresaId: empresa.id,
        competencia: folha.competencia,
        tipo: folha.tipo,
        simulado: folha.simulado,
        nomeArquivo: nomeArquivo.slice(0, 200),
        importadoPorId: user.id,
        itens: {
          create: folha.funcionarios.map((f) => ({
            matricula: f.matricula,
            nome: f.nome,
            funcao: f.funcao,
            situacao: f.situacao,
            divisao: f.divisao,
            salarioBase: f.salarioBase,
            admissao: f.admissao,
            gozoInicio: f.gozoInicio,
            gozoFim: f.gozoFim,
            eventos: JSON.stringify(f.eventos),
          })),
        },
      },
    });
    await tx.importacao.create({
      data: {
        empresaId: empresa.id,
        tipo: folha.tipo === "mensal" ? "folha_pagamento" : "folha_13",
        importadoPorId: user.id,
        nomeArquivo: nomeArquivo.slice(0, 200),
        competencia: folha.competencia,
        criados: folha.funcionarios.length,
        atualizados: 0,
      },
    });
  });

  await logAction(user.id, "folha_pagamento.importar", empresa.id, {
    competencia: folha.competencia,
    tipo: folha.tipo,
    funcionarios: folha.funcionarios.length,
    nomeArquivo,
  });

  return { error: null, competencia: folha.competencia, empresaId: empresa.id, tipo: folha.tipo };
}

export type FolhaImportada = {
  empresaId: string;
  empresaNome: string;
  competencia: string;
  tipo: TipoFolha;
  simulado: boolean;
  importadaEm: string;
};

export async function listarFolhasImportadas(): Promise<FolhaImportada[]> {
  await requirePermissao("folha", "consultar");
  const folhas = await prisma.folhaPagamento.findMany({
    select: {
      empresaId: true,
      competencia: true,
      tipo: true,
      simulado: true,
      updatedAt: true,
      empresa: { select: { nome: true, abbr: true } },
    },
  });
  const ordemTipo: Record<string, number> = { mensal: 0, "13_1": 1, "13_2": 2 };
  return folhas
    .map((f) => ({
      empresaId: f.empresaId,
      empresaNome: f.empresa.abbr || f.empresa.nome,
      competencia: f.competencia,
      tipo: f.tipo as TipoFolha,
      simulado: f.simulado,
      importadaEm: f.updatedAt.toISOString(),
    }))
    .sort((a, b) => {
      const [ma, aa] = a.competencia.split("/").map(Number);
      const [mb, ab] = b.competencia.split("/").map(Number);
      return ab - aa || mb - ma || a.empresaNome.localeCompare(b.empresaNome) || ordemTipo[a.tipo] - ordemTipo[b.tipo];
    });
}

export type AnaliseFolha = {
  empresaNome: string;
  competencia: string;
  tipo: TipoFolha;
  simulado: boolean;
  // 13º: meses do ano com folha mensal importada / faltando, e se a 1ª parcela já está no sistema.
  mesesHistorico: string[];
  mesesFaltando: string[];
  primeiraParcelaImportada: boolean;
  nomeArquivo: string;
  importadaEm: string;
  calendario: CalendarioCompetencia;
  anoParametros: number;
  parametrosExatos: boolean;
  bancoHorasImportado: boolean;
  resumo: ResumoConferencia;
  totais: { proventos: number; descontos: number; liquido: number; inss: number; ir: number; fgts: number; consignado: number };
  funcionarios: ResultadoFuncionario[];
};

export async function buscarAnaliseFolha(
  empresaId: string,
  competencia: string,
  tipo: TipoFolha = "mensal"
): Promise<{ data: AnaliseFolha | null; error: string | null }> {
  await requirePermissao("folha", "consultar");
  const folha = await prisma.folhaPagamento.findUnique({
    where: { empresaId_competencia_tipo: { empresaId, competencia, tipo } },
    include: { empresa: { select: { nome: true, abbr: true } }, itens: { orderBy: { matricula: "asc" } } },
  });
  if (!folha) return { data: null, error: null };

  const funcionarios = folha.itens.map(paraFuncionario);
  let resultados: ResultadoFuncionario[];
  let calendario = calendarioCompetencia(competencia);
  let anoParametros: number;
  let parametrosExatos: boolean;
  let bancoHoras: BancoHorasCompetencia | null = null;
  let mesesHistorico: string[] = [];
  let mesesFaltando: string[] = [];
  let primeiraParcelaImportada = false;
  if (tipo === "mensal") {
    bancoHoras = await carregarBancoHoras(empresaId, competencia);
    ({ resultados, calendario, anoParametros, parametrosExatos } = conferirFolha(funcionarios, competencia, bancoHoras));
  } else {
    const contexto = await carregarContexto13(empresaId, competencia, tipo);
    ({ resultados, anoParametros, parametrosExatos } = conferirFolha13(funcionarios, competencia, tipo, contexto));
    // A 1ª parcela (novembro) usa o histórico até outubro; a 2ª (dezembro), até novembro.
    const ate = tipo === "13_1" ? 10 : 11;
    mesesHistorico = [...contexto.mesesImportados].sort((a, b) => a - b).map((m) => NOMES_MES[m - 1]);
    mesesFaltando = [...Array(ate).keys()].map((i) => i + 1).filter((m) => !contexto.mesesImportados.has(m)).map((m) => NOMES_MES[m - 1]);
    primeiraParcelaImportada = contexto.primeiraParcela !== null;
  }

  const somar = (campo: keyof Pick<ResultadoFuncionario, "proventos" | "descontos" | "liquido" | "inss" | "ir" | "fgts" | "consignado">) =>
    Math.round(resultados.reduce((acc, r) => acc + r[campo], 0) * 100) / 100;

  return {
    data: {
      empresaNome: folha.empresa.abbr || folha.empresa.nome,
      competencia,
      tipo,
      simulado: folha.simulado,
      mesesHistorico,
      mesesFaltando,
      primeiraParcelaImportada,
      nomeArquivo: folha.nomeArquivo,
      importadaEm: folha.updatedAt.toISOString(),
      calendario,
      anoParametros,
      parametrosExatos,
      bancoHorasImportado: tipo !== "mensal" || bancoHoras !== null,
      resumo: resumir(resultados),
      totais: {
        proventos: somar("proventos"),
        descontos: somar("descontos"),
        liquido: somar("liquido"),
        inss: somar("inss"),
        ir: somar("ir"),
        fgts: somar("fgts"),
        consignado: somar("consignado"),
      },
      funcionarios: resultados,
    },
    error: null,
  };
}
