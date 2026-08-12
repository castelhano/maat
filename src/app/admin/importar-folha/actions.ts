"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { primeiraPalavra } from "@/lib/utils";
import { parseFolhaSalarios, type FolhaSalariosLinha } from "@/lib/parsers/folha-salarios";

export type PreviewNovo = {
  matricula: string;
  nome: string;
  funcao: string;
  salario: number;
};

export type PreviewAtualizado = {
  matricula: string;
  nome: string;
  mudancas: string[];
};

export type PreviewNaoEncontrado = {
  matricula: string;
  nome: string;
  cargo: string;
};

export type PreviewResult = {
  empresa: { codigo: string; nome: string; novaEmpresa: boolean };
  competencia: string;
  cargosNovos: string[];
  novos: PreviewNovo[];
  atualizados: PreviewAtualizado[];
  semMudanca: number;
  naoEncontrados: PreviewNaoEncontrado[];
};

async function montarDiff(linhas: FolhaSalariosLinha[], empresa: { codigo: string; nome: string }) {
  const empresaExistente = await prisma.empresa.findUnique({ where: { codigo: empresa.codigo } });

  // Cargo é global (compartilhado entre empresas), então a checagem de "cargo novo" também é global.
  const cargosExistentes = await prisma.cargo.findMany();
  const nomesCargosExistentes = new Set(cargosExistentes.map((c) => c.nome));

  const funcionariosExistentes = empresaExistente
    ? await prisma.funcionario.findMany({
        where: { empresaId: empresaExistente.id },
        include: { cargo: true },
      })
    : [];
  const funcPorMatricula = new Map(funcionariosExistentes.map((f) => [f.matricula, f]));

  const cargosNovos = new Set<string>();
  const novos: PreviewNovo[] = [];
  const atualizados: PreviewAtualizado[] = [];
  let semMudanca = 0;

  for (const linha of linhas) {
    if (!nomesCargosExistentes.has(linha.funcao)) cargosNovos.add(linha.funcao);

    const existente = funcPorMatricula.get(linha.matricula);
    if (!existente) {
      novos.push({
        matricula: linha.matricula,
        nome: linha.nome,
        funcao: linha.funcao,
        salario: linha.salario,
      });
      continue;
    }

    // A sincronização nunca mexe em status/afastamento/desligamento — isso é decisão manual.
    const mudancas: string[] = [];
    if (existente.cargo.nome !== linha.funcao) {
      mudancas.push(`cargo: ${existente.cargo.nome} → ${linha.funcao}`);
    }
    if (!existente.salario.equals(linha.salario)) {
      mudancas.push(`salário: ${existente.salario.toFixed(2)} → ${linha.salario.toFixed(2)}`);
    }

    if (mudancas.length > 0) {
      atualizados.push({ matricula: linha.matricula, nome: linha.nome, mudancas });
    } else {
      semMudanca++;
    }
  }

  const matriculasNoArquivo = new Set(linhas.map((l) => l.matricula));
  const naoEncontrados: PreviewNaoEncontrado[] = funcionariosExistentes
    .filter((f) => f.status === "ativo" && !matriculasNoArquivo.has(f.matricula))
    .map((f) => ({ matricula: f.matricula, nome: f.nome, cargo: f.cargo.nome }));

  return {
    empresaExistente,
    cargosNovos: [...cargosNovos],
    novos,
    atualizados,
    semMudanca,
    naoEncontrados,
  };
}

export async function previewImportacao(conteudo: string): Promise<{ data: PreviewResult | null; error: string | null }> {
  await requireAdmin();

  let parsed;
  try {
    parsed = parseFolhaSalarios(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas, parsed.empresa);

  return {
    data: {
      empresa: { ...parsed.empresa, novaEmpresa: !diff.empresaExistente },
      competencia: parsed.competencia,
      cargosNovos: diff.cargosNovos,
      novos: diff.novos,
      atualizados: diff.atualizados,
      semMudanca: diff.semMudanca,
      naoEncontrados: diff.naoEncontrados,
    },
    error: null,
  };
}

export async function confirmarImportacao(
  conteudo: string,
  nomeArquivo: string
): Promise<{ error: string | null; resumo?: { criados: number; atualizados: number; naoEncontrados: number } }> {
  const admin = await requireAdmin();

  let parsed;
  try {
    parsed = parseFolhaSalarios(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const resumo = await prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.upsert({
      where: { codigo: parsed.empresa.codigo },
      create: { codigo: parsed.empresa.codigo, nome: parsed.empresa.nome, abbr: primeiraPalavra(parsed.empresa.nome) },
      update: { nome: parsed.empresa.nome },
    });

    const cargoIdPorNome = new Map<string, string>();
    let criados = 0;
    let atualizados = 0;

    for (const linha of parsed.linhas) {
      let cargoId = cargoIdPorNome.get(linha.funcao);
      if (!cargoId) {
        const cargo = await tx.cargo.upsert({
          where: { nome: linha.funcao },
          create: { nome: linha.funcao },
          update: {},
        });
        cargoId = cargo.id;
        cargoIdPorNome.set(linha.funcao, cargoId);
      }

      const existente = await tx.funcionario.findUnique({
        where: { empresaId_matricula: { empresaId: empresa.id, matricula: linha.matricula } },
      });

      if (existente) {
        // Só cargo e salário — status/afastamento/desligamento são decisão manual, sync não toca.
        await tx.funcionario.update({
          where: { id: existente.id },
          data: { cargoId, salario: linha.salario },
        });
        atualizados++;
      } else {
        await tx.funcionario.create({
          data: {
            empresaId: empresa.id,
            matricula: linha.matricula,
            nome: linha.nome,
            dataAdmissao: linha.dataAdmissao,
            cargoId,
            salario: linha.salario,
            status: "ativo",
          },
        });
        criados++;
      }
    }

    const matriculasNoArquivo = parsed.linhas.map((l) => l.matricula);
    const naoEncontrados = await tx.funcionario.findMany({
      where: { empresaId: empresa.id, status: "ativo", matricula: { notIn: matriculasNoArquivo } },
      select: { matricula: true, nome: true },
    });

    await tx.importacao.create({
      data: {
        empresaId: empresa.id,
        importadoPorId: admin.id,
        nomeArquivo,
        competencia: parsed.competencia,
        criados,
        atualizados,
        naoEncontrados: naoEncontrados.length > 0 ? JSON.stringify(naoEncontrados) : null,
      },
    });

    return { criados, atualizados, naoEncontrados: naoEncontrados.length };
  });

  return { error: null, resumo };
}
