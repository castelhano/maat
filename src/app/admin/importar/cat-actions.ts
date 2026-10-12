"use server";

import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";
import { parseCat, type CatLinha } from "@/lib/parsers/cat";
import { competenciaPadrao } from "@/lib/competencia";

export type PreviewCatLinha = {
  matricula: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  dataAcidente: string;
  jaImportado: boolean;
};

export type PreviewCatAmbiguo = {
  matricula: string;
  nome: string;
  dataAcidente: string;
  empresasPossiveis: { id: string; nome: string }[];
};

export type PreviewCatResult = {
  totalLinhas: number;
  novos: PreviewCatLinha[];
  jaImportados: number;
  ambiguos: PreviewCatAmbiguo[];
  naoEncontrados: { matricula: string; nome: string; dataAcidente: string }[];
};

async function montarDiff(linhas: CatLinha[]) {
  const matriculas = linhas.map((l) => l.matricula);
  const funcionarios = await prisma.funcionario.findMany({
    where: { matricula: { in: matriculas } },
    include: { empresa: true },
  });
  const porMatricula = new Map<string, typeof funcionarios>();
  for (const f of funcionarios) {
    const lista = porMatricula.get(f.matricula) ?? [];
    lista.push(f);
    porMatricula.set(f.matricula, lista);
  }

  const novos: PreviewCatLinha[] = [];
  const ambiguos: PreviewCatAmbiguo[] = [];
  const naoEncontrados: { matricula: string; nome: string; dataAcidente: string }[] = [];
  let jaImportados = 0;

  for (const linha of linhas) {
    const candidatos = porMatricula.get(linha.matricula) ?? [];
    if (candidatos.length === 0) {
      naoEncontrados.push({
        matricula: linha.matricula,
        nome: linha.nome,
        dataAcidente: linha.dataAcidente.toISOString(),
      });
      continue;
    }
    if (candidatos.length > 1) {
      ambiguos.push({
        matricula: linha.matricula,
        nome: linha.nome,
        dataAcidente: linha.dataAcidente.toISOString(),
        empresasPossiveis: candidatos.map((c) => ({ id: c.empresaId, nome: c.empresa.nome })),
      });
      continue;
    }

    const funcionario = candidatos[0];
    const existente = await prisma.cat.findUnique({
      where: { funcionarioId_dataAcidente: { funcionarioId: funcionario.id, dataAcidente: linha.dataAcidente } },
    });

    if (existente) {
      jaImportados++;
      continue;
    }

    novos.push({
      matricula: linha.matricula,
      nome: linha.nome,
      empresaId: funcionario.empresaId,
      empresaNome: funcionario.empresa.nome,
      dataAcidente: linha.dataAcidente.toISOString(),
      jaImportado: false,
    });
  }

  return { novos, jaImportados, ambiguos, naoEncontrados };
}

export async function previewCat(conteudo: string): Promise<{ data: PreviewCatResult | null; error: string | null }> {
  await requirePermissao("importar", "operar");

  let parsed;
  try {
    parsed = parseCat(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  return {
    data: {
      totalLinhas: parsed.linhas.length,
      novos: diff.novos,
      jaImportados: diff.jaImportados,
      ambiguos: diff.ambiguos,
      naoEncontrados: diff.naoEncontrados,
    },
    error: null,
  };
}

export async function confirmarCat(
  conteudo: string,
  nomeArquivo: string,
  resolucoesAmbiguas: Record<string, string>
): Promise<{ error: string | null; resumo?: { criados: number; ignorados: number; naoEncontrados: number } }> {
  const admin = await requirePermissao("importar", "operar");

  let parsed;
  try {
    parsed = parseCat(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  const ambiguosPendentes = diff.ambiguos.filter((a) => !resolucoesAmbiguas[`${a.matricula}:${a.dataAcidente}`]);
  if (ambiguosPendentes.length > 0) {
    return {
      error: `${ambiguosPendentes.length} registro(s) ambíguo(s) ainda sem empresa escolhida. Resolva antes de confirmar.`,
    };
  }

  const resumo = await prisma.$transaction(async (tx) => {
    let criados = 0;
    const porEmpresa = new Map<string, number>();

    async function criar(funcionarioId: string, empresaId: string, linha: CatLinha) {
      const existente = await tx.cat.findUnique({
        where: { funcionarioId_dataAcidente: { funcionarioId, dataAcidente: linha.dataAcidente } },
      });
      if (existente) return;

      await tx.cat.create({
        data: {
          funcionarioId,
          dataAcidente: linha.dataAcidente,
          dataEmissao: linha.dataEmissao,
          houveAfastamento: linha.houveAfastamento,
          numeroCat: linha.numeroCat,
          tipoAcidente: linha.tipoAcidente,
          descricaoAcidente: linha.descricaoAcidente,
          situacaoFuncionario: linha.situacaoFuncionario,
          codSetor: linha.codSetor,
          descSetor: linha.descSetor,
        },
      });
      criados++;
      porEmpresa.set(empresaId, (porEmpresa.get(empresaId) ?? 0) + 1);
    }

    for (const linha of parsed.linhas) {
      const chaveAmbiguo = diff.ambiguos.find(
        (a) => a.matricula === linha.matricula && a.dataAcidente === linha.dataAcidente.toISOString()
      );

      if (chaveAmbiguo) {
        const empresaId = resolucoesAmbiguas[`${chaveAmbiguo.matricula}:${chaveAmbiguo.dataAcidente}`];
        const funcionario = await tx.funcionario.findUnique({
          where: { empresaId_matricula: { empresaId, matricula: linha.matricula } },
        });
        if (funcionario) await criar(funcionario.id, empresaId, linha);
        continue;
      }

      const funcionario = await tx.funcionario.findFirst({ where: { matricula: linha.matricula } });
      if (!funcionario) continue;
      await criar(funcionario.id, funcionario.empresaId, linha);
    }

    for (const [empresaId, qtd] of porEmpresa) {
      await tx.importacao.create({
        data: {
          empresaId,
          tipo: "cat",
          importadoPorId: admin.id,
          nomeArquivo,
          competencia: competenciaPadrao().mes + "/" + competenciaPadrao().ano,
          criados: qtd,
          atualizados: 0,
          naoEncontrados: diff.naoEncontrados.length > 0 ? JSON.stringify(diff.naoEncontrados) : null,
        },
      });
    }

    return { criados };
  });

  return {
    error: null,
    resumo: { criados: resumo.criados, ignorados: diff.jaImportados, naoEncontrados: diff.naoEncontrados.length },
  };
}
