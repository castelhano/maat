"use server";

import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";
import { parseAfastamentos, type AfastamentoLinha, type AfastamentosParseResult } from "@/lib/parsers/afastamentos";

export type PreviewAtualizacaoAfastamento = {
  matricula: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  mudancas: string[];
};

export type PreviewAmbiguoAfastamento = {
  matricula: string;
  nome: string;
  empresasPossiveis: { id: string; nome: string }[];
};

export type PreviewPossivelRetorno = {
  matricula: string;
  nome: string;
  empresaNome: string;
  dataAfastamentoAtual: string | null;
};

export type PreviewAfastamentosResult = {
  totalLinhas: number;
  atualizados: PreviewAtualizacaoAfastamento[];
  semMudanca: number;
  ambiguos: PreviewAmbiguoAfastamento[];
  naoEncontrados: { matricula: string; nome: string }[];
  possiveisRetornos: PreviewPossivelRetorno[];
};

async function montarDiff(linhas: AfastamentoLinha[]) {
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

  const atualizados: PreviewAtualizacaoAfastamento[] = [];
  const ambiguos: PreviewAmbiguoAfastamento[] = [];
  const naoEncontrados: { matricula: string; nome: string }[] = [];
  let semMudanca = 0;

  // O relatório mensal (CSV) já traz o código da empresa — usamos isso pra desambiguar
  // automaticamente quando a mesma matrícula existe em mais de uma empresa, em vez de sempre
  // exigir escolha manual (só o formato TXT antigo, sem empresa, precisa disso).
  const formatoMensal = linhas.some((l) => l.empresaCodigo !== null);

  for (const linha of linhas) {
    let candidatos = porMatricula.get(linha.matricula) ?? [];
    if (linha.empresaCodigo && candidatos.length > 1) {
      const filtrados = candidatos.filter((c) => c.empresa.codigo === linha.empresaCodigo);
      if (filtrados.length === 1) candidatos = filtrados;
    }

    if (candidatos.length === 0) {
      naoEncontrados.push({ matricula: linha.matricula, nome: linha.nome });
      continue;
    }
    if (candidatos.length > 1) {
      ambiguos.push({
        matricula: linha.matricula,
        nome: linha.nome,
        empresasPossiveis: candidatos.map((c) => ({ id: c.empresaId, nome: c.empresa.nome })),
      });
      continue;
    }

    const funcionario = candidatos[0];
    const retornou = linha.dataRetorno !== null;
    const mudancas: string[] = [];

    if (retornou) {
      if (funcionario.status !== "ativo") {
        mudancas.push(
          `situação: ${funcionario.status} → ativo (retornou em ${linha.dataRetorno!.toLocaleDateString("pt-BR")})`
        );
      }
      // Data de retorno é o que a apuração de benefícios usa pra proporcionalizar o VR do mês —
      // precisa disparar atualização mesmo quando status/afastamento já estavam "limpos" (ex.:
      // afastou e voltou dentro do mesmo mês, então nunca chegou a persistir como "afastado").
      if ((funcionario.dataRetorno?.getTime() ?? null) !== linha.dataRetorno!.getTime()) {
        mudancas.push(
          `data de retorno: ${funcionario.dataRetorno ? funcionario.dataRetorno.toLocaleDateString("pt-BR") : "—"} → ${linha.dataRetorno!.toLocaleDateString("pt-BR")}`
        );
      }
      if ((funcionario.motivoAfastamento ?? "") !== linha.motivo) {
        mudancas.push(`motivo: ${funcionario.motivoAfastamento ?? "—"} → ${linha.motivo}`);
      }
    } else {
      if (funcionario.status !== "afastado") {
        mudancas.push(`situação: ${funcionario.status} → afastado`);
      }
      const dataAtual = funcionario.dataAfastamento?.getTime() ?? null;
      if (dataAtual !== linha.dataAfastamento.getTime()) {
        mudancas.push(
          `data do afastamento: ${funcionario.dataAfastamento ? funcionario.dataAfastamento.toLocaleDateString("pt-BR") : "—"} → ${linha.dataAfastamento.toLocaleDateString("pt-BR")}`
        );
      }
      if ((funcionario.motivoAfastamento ?? "") !== linha.motivo) {
        mudancas.push(`motivo: ${funcionario.motivoAfastamento ?? "—"} → ${linha.motivo}`);
      }
    }

    if (mudancas.length > 0) {
      atualizados.push({
        matricula: linha.matricula,
        nome: linha.nome,
        empresaId: funcionario.empresaId,
        empresaNome: funcionario.empresa.nome,
        mudancas,
      });
    } else {
      semMudanca++;
    }
  }

  // Quem está "afastado" no cadastro mas não apareceu neste arquivo pode ter retornado ao
  // trabalho. Só faz sentido como sinal no formato TXT antigo (uma "foto" de quem está afastado
  // hoje) — no relatório mensal, ausência é normal pra quem não teve nenhum evento no período,
  // então o sinal aqui seria só ruído.
  let possiveisRetornos: PreviewPossivelRetorno[] = [];
  if (!formatoMensal) {
    const matriculasNoArquivo = new Set(matriculas);
    const afastadosNoCadastro = await prisma.funcionario.findMany({
      where: { status: "afastado", matricula: { notIn: [...matriculasNoArquivo] } },
      include: { empresa: true },
    });
    possiveisRetornos = afastadosNoCadastro.map((f) => ({
      matricula: f.matricula,
      nome: f.nome,
      empresaNome: f.empresa.nome,
      dataAfastamentoAtual: f.dataAfastamento ? f.dataAfastamento.toISOString() : null,
    }));
  }

  return { atualizados, ambiguos, naoEncontrados, semMudanca, possiveisRetornos };
}

export async function previewAfastamentos(
  conteudo: string
): Promise<{ data: PreviewAfastamentosResult | null; error: string | null }> {
  await requirePermissao("importar", "operar");

  let parsed;
  try {
    parsed = parseAfastamentos(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  return {
    data: {
      totalLinhas: parsed.linhas.length,
      atualizados: diff.atualizados,
      semMudanca: diff.semMudanca,
      ambiguos: diff.ambiguos,
      naoEncontrados: diff.naoEncontrados,
      possiveisRetornos: diff.possiveisRetornos,
    },
    error: null,
  };
}

export async function confirmarAfastamentos(
  conteudo: string,
  nomeArquivo: string,
  competencia: string,
  resolucoesAmbiguas: Record<string, string>
): Promise<{ error: string | null; resumo?: { atualizados: number; naoEncontrados: number } }> {
  const admin = await requirePermissao("importar", "operar");

  if (!competencia.trim()) {
    return { error: "Selecione a competência antes de confirmar." };
  }

  let parsed: AfastamentosParseResult;
  try {
    parsed = parseAfastamentos(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const diff = await montarDiff(parsed.linhas);

  const ambiguosPendentes = diff.ambiguos.filter((a) => !resolucoesAmbiguas[a.matricula]);
  if (ambiguosPendentes.length > 0) {
    return {
      error: `${ambiguosPendentes.length} matrícula(s) ambígua(s) ainda sem empresa escolhida. Resolva antes de confirmar.`,
    };
  }

  const resumo = await prisma.$transaction(async (tx) => {
    let atualizadosCount = 0;
    const porEmpresa = new Map<string, number>();

    async function aplicar(empresaId: string, matricula: string) {
      const linha = parsed.linhas.find((l) => l.matricula === matricula)!;
      const retornou = linha.dataRetorno !== null;
      const funcionario = await tx.funcionario.findUnique({ where: { empresaId_matricula: { empresaId, matricula } } });
      if (!funcionario) return;

      // Histórico completo (pode ter mais de um ciclo no mesmo mês) — os campos dataAfastamento/
      // dataRetorno do Funcionario abaixo continuam existindo só como atalho do ciclo mais
      // recente; quem apura benefício usa este histórico pra contar os dias certos.
      const cicloAberto = await tx.afastamentoHistorico.findFirst({
        where: { funcionarioId: funcionario.id, dataFim: null },
        orderBy: { dataInicio: "desc" },
      });

      if (retornou) {
        if (cicloAberto) {
          await tx.afastamentoHistorico.update({ where: { id: cicloAberto.id }, data: { dataFim: linha.dataRetorno! } });
        } else {
          // Não tinha ciclo em aberto registrado (ex.: primeira importação) — reconstrói com o
          // que o próprio arquivo trouxe.
          await tx.afastamentoHistorico.create({
            data: { funcionarioId: funcionario.id, dataInicio: linha.dataAfastamento, dataFim: linha.dataRetorno!, motivo: linha.motivo },
          });
        }
      } else if (cicloAberto && cicloAberto.dataInicio.getTime() === linha.dataAfastamento.getTime()) {
        // Mesmo ciclo já registrado (ex.: reimportação só corrigindo o motivo) — atualiza em vez
        // de duplicar.
        await tx.afastamentoHistorico.update({ where: { id: cicloAberto.id }, data: { motivo: linha.motivo } });
      } else {
        // Novo ciclo de afastamento — se já havia um aberto com data diferente (não deveria
        // acontecer, mas por segurança), fecha ele na data desse novo antes de abrir o próximo.
        if (cicloAberto) {
          await tx.afastamentoHistorico.update({ where: { id: cicloAberto.id }, data: { dataFim: linha.dataAfastamento } });
        }
        await tx.afastamentoHistorico.create({
          data: { funcionarioId: funcionario.id, dataInicio: linha.dataAfastamento, dataFim: null, motivo: linha.motivo },
        });
      }

      await tx.funcionario.update({
        where: { id: funcionario.id },
        data: retornou
          ? {
              status: "ativo",
              // Mantém a data E o motivo do afastamento desse mesmo evento (em vez de apagar): se
              // a data caiu no mesmo mês do retorno, a apuração de benefícios usa as duas juntas
              // pra saber que só essa janela ficou de fora, não o mês inteiro até o retorno — e o
              // motivo continua necessário depois do retorno pra regra de "licença sem
              // remuneração com menos de 28 dias trabalhados", inclusive em competências
              // seguintes que olham pra trás (ex.: crédito de cesta convertida em VR do mês
              // seguinte, que depende da elegibilidade do mês anterior).
              dataAfastamento: linha.dataAfastamento,
              motivoAfastamento: linha.motivo,
              dataRetorno: linha.dataRetorno,
            }
          : { status: "afastado", dataAfastamento: linha.dataAfastamento, motivoAfastamento: linha.motivo, dataRetorno: null },
      });
      atualizadosCount++;
      porEmpresa.set(empresaId, (porEmpresa.get(empresaId) ?? 0) + 1);
    }

    for (const item of diff.atualizados) {
      await aplicar(item.empresaId, item.matricula);
    }
    for (const ambiguo of diff.ambiguos) {
      const empresaId = resolucoesAmbiguas[ambiguo.matricula];
      const existe = await tx.funcionario.findUnique({
        where: { empresaId_matricula: { empresaId, matricula: ambiguo.matricula } },
      });
      if (existe) await aplicar(empresaId, ambiguo.matricula);
    }

    for (const [empresaId, atualizados] of porEmpresa) {
      await tx.importacao.create({
        data: {
          empresaId,
          tipo: "afastamentos",
          importadoPorId: admin.id,
          nomeArquivo,
          competencia,
          criados: 0,
          atualizados,
          naoEncontrados: null,
        },
      });
    }

    return { atualizados: atualizadosCount, naoEncontrados: diff.naoEncontrados.length };
  });

  return { error: null, resumo };
}
