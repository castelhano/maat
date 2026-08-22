"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { parseFerias, diasDireitoPorFaltas, type FeriasLinha } from "@/lib/parsers/ferias";

export type PreviewLinha = {
  matricula: string;
  nome: string;
  funcao: string;
  faltas: number;
  diasDireito: number;
  vencimento: string;
  limite: string;
};

export type PreviewResult = {
  empresa: { codigo: string; nome: string; existente: boolean };
  dataBase: string;
  novos: PreviewLinha[];
  atualizados: PreviewLinha[];
  semMudanca: number;
  naoEncontrados: { matricula: string; nome: string; funcao: string }[];
};

async function montarDiff(linhas: FeriasLinha[], codigoEmpresa: string) {
  const empresa = await prisma.empresa.findUnique({ where: { codigo: codigoEmpresa } });
  const funcionarios = empresa
    ? await prisma.funcionario.findMany({
        where: { empresaId: empresa.id },
        include: { feriasPeriodos: true },
      })
    : [];
  const funcPorMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));

  const novos: PreviewLinha[] = [];
  const atualizados: PreviewLinha[] = [];
  const naoEncontrados: PreviewResult["naoEncontrados"] = [];
  let semMudanca = 0;

  for (const linha of linhas) {
    const diasDireito = diasDireitoPorFaltas(linha.faltas);
    const resumo: PreviewLinha = {
      matricula: linha.matricula,
      nome: linha.nome,
      funcao: linha.funcao,
      faltas: linha.faltas,
      diasDireito,
      vencimento: linha.vencimento.toISOString(),
      limite: linha.limite.toISOString(),
    };

    const func = funcPorMatricula.get(linha.matricula);
    if (!func) {
      naoEncontrados.push({ matricula: linha.matricula, nome: linha.nome, funcao: linha.funcao });
      continue;
    }

    const periodoExistente = func.feriasPeriodos.find(
      (p) => p.periodoAquisitivoFim.getTime() === linha.vencimento.getTime()
    );
    if (!periodoExistente) {
      novos.push(resumo);
    } else if (
      periodoExistente.faltas !== linha.faltas ||
      periodoExistente.diasDireito !== diasDireito ||
      periodoExistente.dataLimite.getTime() !== linha.limite.getTime()
    ) {
      atualizados.push(resumo);
    } else {
      semMudanca++;
    }
  }

  return { empresa, novos, atualizados, semMudanca, naoEncontrados };
}

export async function previewImportacaoFerias(
  conteudo: string
): Promise<{ data: PreviewResult | null; error: string | null }> {
  await requireAdmin();

  let parsed;
  try {
    parsed = parseFerias(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas, parsed.empresa.codigo);

  return {
    data: {
      empresa: { ...parsed.empresa, existente: !!diff.empresa },
      dataBase: parsed.dataBase.toISOString(),
      novos: diff.novos,
      atualizados: diff.atualizados,
      semMudanca: diff.semMudanca,
      naoEncontrados: diff.naoEncontrados,
    },
    error: null,
  };
}

export async function confirmarImportacaoFerias(
  conteudo: string,
  nomeArquivo: string
): Promise<{ error: string | null; resumo?: { criados: number; atualizados: number; naoEncontrados: number } }> {
  const admin = await requireAdmin();

  let parsed;
  try {
    parsed = parseFerias(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: parsed.empresa.codigo } });
  if (!empresa) {
    return {
      error: `Empresa "${parsed.empresa.nome}" (código ${parsed.empresa.codigo}) ainda não está cadastrada. Importe a folha de salários dessa empresa primeiro.`,
    };
  }

  const resumo = await prisma.$transaction(async (tx) => {
    const funcionarios = await tx.funcionario.findMany({ where: { empresaId: empresa.id } });
    const funcPorMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));

    let criados = 0;
    let atualizados = 0;
    const naoEncontrados: { matricula: string; nome: string }[] = [];

    for (const linha of parsed.linhas) {
      const func = funcPorMatricula.get(linha.matricula);
      if (!func) {
        naoEncontrados.push({ matricula: linha.matricula, nome: linha.nome });
        continue;
      }

      const diasDireito = diasDireitoPorFaltas(linha.faltas);

      const existente = await tx.ferias.findUnique({
        where: {
          funcionarioId_periodoAquisitivoFim: {
            funcionarioId: func.id,
            periodoAquisitivoFim: linha.vencimento,
          },
        },
      });

      if (existente) {
        // Reimportar só atualiza os dados de origem do arquivo — nunca mexe na programação
        // (mês/quinzena/abono/status) já feita manualmente na tela.
        await tx.ferias.update({
          where: { id: existente.id },
          data: {
            periodoAquisitivoInicio: linha.aquisicao,
            dataLimite: linha.limite,
            meses: linha.meses,
            faltas: linha.faltas,
            diasDireito,
          },
        });
        atualizados++;
      } else {
        await tx.ferias.create({
          data: {
            funcionarioId: func.id,
            periodoAquisitivoInicio: linha.aquisicao,
            periodoAquisitivoFim: linha.vencimento,
            dataLimite: linha.limite,
            meses: linha.meses,
            faltas: linha.faltas,
            diasDireito,
          },
        });
        criados++;
      }
    }

    await tx.importacao.create({
      data: {
        empresaId: empresa.id,
        tipo: "ferias",
        importadoPorId: admin.id,
        nomeArquivo,
        competencia: parsed.dataBase.toISOString().slice(0, 10),
        criados,
        atualizados,
        naoEncontrados: naoEncontrados.length > 0 ? JSON.stringify(naoEncontrados) : null,
      },
    });

    return { criados, atualizados, naoEncontrados: naoEncontrados.length };
  });

  return { error: null, resumo };
}

// ---------------------------------------------------------------------------
// Programação manual (mês, quinzena, abono) de um período de férias.
// ---------------------------------------------------------------------------

export type ProgramacaoInput = {
  feriasId: string;
  mes: number | null;
  ano: number | null;
  quinzena: number | null;
  diasAbono: number;
  abonoTipo: "inicio" | "final" | null;
};

function calcularDatas(input: ProgramacaoInput, diasGozo: number) {
  if (!input.mes || !input.ano || !input.quinzena) {
    return { gozoInicio: null, gozoFim: null, dataPagamento: null };
  }
  const diaBase = input.quinzena === 2 ? 16 : 1;
  let gozoInicio = new Date(Date.UTC(input.ano, input.mes - 1, diaBase));
  if (input.abonoTipo === "inicio" && input.diasAbono > 0) {
    gozoInicio = new Date(gozoInicio.getTime() + input.diasAbono * 86_400_000);
  }
  const gozoFim = new Date(gozoInicio.getTime() + (diasGozo - 1) * 86_400_000);
  const dataPagamento = new Date(gozoInicio.getTime() - 2 * 86_400_000);
  return { gozoInicio, gozoFim, dataPagamento };
}

export async function salvarProgramacao(
  input: ProgramacaoInput
): Promise<{ error: string | null }> {
  await requireAdmin();

  const ferias = await prisma.ferias.findUnique({ where: { id: input.feriasId } });
  if (!ferias) return { error: "Período de férias não encontrado." };

  if (input.diasAbono > 0 && !input.abonoTipo) {
    return { error: "Escolha se o abono fica no início ou no final do período de gozo." };
  }
  if (input.diasAbono > Math.floor(ferias.diasDireito / 3)) {
    return { error: `Abono não pode passar de 1/3 dos dias de direito (máx. ${Math.floor(ferias.diasDireito / 3)} dias).` };
  }

  const diasGozo = ferias.diasDireito - input.diasAbono;
  const { gozoInicio, gozoFim, dataPagamento } = calcularDatas(input, diasGozo);

  await prisma.ferias.update({
    where: { id: input.feriasId },
    data: {
      mes: input.mes,
      ano: input.ano,
      quinzena: input.quinzena,
      diasAbono: input.diasAbono,
      abonoTipo: input.abonoTipo,
      gozoInicio,
      gozoFim,
      dataPagamento,
      status: gozoInicio ? "programado" : "pendente",
    },
  });

  return { error: null };
}
