"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { parseAdmitidosDesligados, MOTIVO_TRANSFERENCIA_COM_ONUS, type EventoLinha } from "@/lib/parsers/admitidos-desligados";

const FUNCAO_APRENDIZ = "APRENDIZ";

async function resolverSetorAprendiz(): Promise<string | null> {
  // SQLite não tem filtro "insensitive" no Prisma — compara em memória.
  const cargos = await prisma.cargo.findMany({ select: { nome: true, setor: true } });
  const cargo = cargos.find((c) => c.nome.toUpperCase() === FUNCAO_APRENDIZ);
  return cargo?.setor ?? null;
}

export type PreviewMovimentacaoLinha = { competencia: string; quantidade: number; indicadorExiste: boolean };

export type PreviewFuncionarioSync = {
  matricula: string;
  nome: string;
  diaAproximado?: boolean;
  // Só preenchido junto com diaAproximado — usado na confirmação pra reconstruir a data (mês/ano)
  // já que o TXT não traz o dia.
  competencia?: string;
};

export type PreviewMovimentacaoResult = {
  empresaId: string;
  empresaNome: string;
  tipo: "admitidos" | "desligados";
  totalLinhasArquivo: number;
  linhas: PreviewMovimentacaoLinha[];
  // Preenchido pro relatório de desligados, em qualquer formato — sincroniza o status
  // "desligado" no cadastro de Funcionário. No CSV casa por matrícula (confiável); no TXT casa
  // por nome (a matrícula sai cortada nesse formato) e a data vem só com mês/ano — nesse caso
  // usa o dia 1 como aproximação (`diaAproximado: true`) até o dia exato ser confirmado no
  // cadastro, o que pode mudar o resultado da regra "desligado depois do dia 25 mantém o VR".
  syncFuncionarios: {
    paraAtualizar: PreviewFuncionarioSync[];
    jaDesligados: number;
    naoEncontrados: PreviewFuncionarioSync[];
  } | null;
  // Desligados por "TRANSFERENCIA ( COM ONUS )" (só no CSV, que traz matrícula pra achar o setor
  // da pessoa via cadastro) — excluídos do turnover, gravados em IndicadorMensal.desligadosTransferencia
  // por competência+setor. Não inclui quem já é aprendiz (esses já saem via aprendizesDesligados).
  transferenciaComOnus: { competencia: string; setor: string; quantidade: number }[];
};

function competenciaParaData(competencia: string): Date {
  const [mes, ano] = competencia.split("/").map(Number);
  return new Date(Date.UTC(ano, mes - 1, 1));
}

async function montarPreview(conteudo: string): Promise<{ data: PreviewMovimentacaoResult | null; error: string | null }> {
  let parsed;
  try {
    parsed = parseAdmitidosDesligados(conteudo);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: parsed.empresaCodigo } });
  if (!empresa) {
    return {
      data: null,
      error: `Empresa ${parsed.empresaCodigo} ainda não está cadastrada — importe o cadastro dela antes.`,
    };
  }

  const setor = await resolverSetorAprendiz();
  if (!setor) {
    return {
      data: null,
      error: 'Não encontrei o cargo "Aprendiz" cadastrado — importe o cadastro antes de importar este relatório.',
    };
  }

  const porCompetencia = new Map<string, number>();
  for (const linha of parsed.linhas) {
    if (linha.funcao.toUpperCase() !== FUNCAO_APRENDIZ) continue;
    porCompetencia.set(linha.competencia, (porCompetencia.get(linha.competencia) ?? 0) + 1);
  }

  const competencias = [...porCompetencia.keys()];
  const indicadoresExistentes = await prisma.indicadorMensal.findMany({
    where: { empresaId: empresa.id, setor, competencia: { in: competencias } },
    select: { competencia: true },
  });
  const existentes = new Set(indicadoresExistentes.map((i) => i.competencia));

  const linhas = competencias
    .sort()
    .map((competencia) => ({
      competencia,
      quantidade: porCompetencia.get(competencia)!,
      indicadorExiste: existentes.has(competencia),
    }));

  // Sincronização do cadastro de Funcionário — pro relatório de desligados (admitidos quem
  // cria/atualiza é a folha de salários, que já traz cargo e salário, que esse relatório não
  // tem). No CSV casa por matrícula, que é confiável. No TXT a matrícula sai cortada e não é
  // confiável, então casa por nome dentro da mesma empresa.
  let syncFuncionarios: PreviewMovimentacaoResult["syncFuncionarios"] = null;
  const transferenciaComOnus: PreviewMovimentacaoResult["transferenciaComOnus"] = [];
  if (parsed.tipo === "desligados") {
    const comMatricula = parsed.linhas.filter((l): l is EventoLinha & { matricula: string } => l.matricula !== null);
    const semMatricula = parsed.linhas.filter((l) => l.matricula === null);

    if (comMatricula.length > 0 || semMatricula.length > 0) {
      const funcionarios = await prisma.funcionario.findMany({
        where: { empresaId: empresa.id },
        select: { matricula: true, nome: true, status: true, cargo: { select: { setor: true } } },
      });
      const porMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));

      // Transferência com ônus: conta por competência+setor (do cadastro da pessoa), excluindo
      // quem é aprendiz (já contado à parte em aprendizesDesligados, pra não descontar 2x).
      const porCompetenciaSetor = new Map<string, number>();
      for (const linha of comMatricula) {
        if (!linha.motivo || !MOTIVO_TRANSFERENCIA_COM_ONUS.test(linha.motivo)) continue;
        if (linha.funcao.toUpperCase() === FUNCAO_APRENDIZ) continue;
        const funcionario = porMatricula.get(linha.matricula);
        const setorPessoa = funcionario?.cargo.setor;
        if (!setorPessoa) continue;
        const chave = `${linha.competencia}|${setorPessoa}`;
        porCompetenciaSetor.set(chave, (porCompetenciaSetor.get(chave) ?? 0) + 1);
      }
      for (const [chave, quantidade] of porCompetenciaSetor) {
        const [competencia, setorPessoa] = chave.split("|");
        transferenciaComOnus.push({ competencia, setor: setorPessoa, quantidade });
      }
      const normalizar = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

      const paraAtualizar: PreviewFuncionarioSync[] = [];
      const naoEncontrados: PreviewFuncionarioSync[] = [];
      let jaDesligados = 0;

      for (const linha of comMatricula) {
        const funcionario = porMatricula.get(linha.matricula);
        if (!funcionario) {
          naoEncontrados.push({ matricula: linha.matricula, nome: linha.nome });
        } else if (funcionario.status === "desligado") {
          jaDesligados++;
        } else {
          paraAtualizar.push({ matricula: linha.matricula, nome: linha.nome });
        }
      }

      for (const linha of semMatricula) {
        const alvo = normalizar(linha.nome);
        // Nome no TXT vem cortado em até 23 caracteres — compara nos dois sentidos.
        const candidatos = funcionarios.filter((f) => {
          const nomeF = normalizar(f.nome);
          return nomeF === alvo || nomeF.startsWith(alvo) || alvo.startsWith(nomeF);
        });
        if (candidatos.length !== 1) {
          naoEncontrados.push({
            matricula: "—",
            nome: candidatos.length > 1 ? `${linha.nome} (nome ambíguo, ${candidatos.length} cadastros parecidos)` : linha.nome,
          });
          continue;
        }
        const funcionario = candidatos[0];
        if (funcionario.status === "desligado") {
          jaDesligados++;
        } else {
          paraAtualizar.push({
            matricula: funcionario.matricula,
            nome: linha.nome,
            diaAproximado: true,
            competencia: linha.competencia,
          });
        }
      }

      syncFuncionarios = { paraAtualizar, jaDesligados, naoEncontrados };
    }
  }

  return {
    data: {
      empresaId: empresa.id,
      empresaNome: empresa.nome,
      tipo: parsed.tipo,
      totalLinhasArquivo: parsed.linhas.length,
      linhas,
      syncFuncionarios,
      transferenciaComOnus,
    },
    error: null,
  };
}

export async function previewMovimentacaoAprendiz(
  conteudo: string
): Promise<{ data: PreviewMovimentacaoResult | null; error: string | null }> {
  await requireAdmin();
  return montarPreview(conteudo);
}

export async function confirmarMovimentacaoAprendiz(
  conteudo: string,
  nomeArquivo: string
): Promise<{
  error: string | null;
  resumo?: {
    competenciasAtualizadas: number;
    competenciasSemIndicador: number;
    funcionariosDesligados: number;
    funcionariosNaoEncontrados: number;
    transferenciaComOnus: number;
  };
}> {
  const admin = await requireAdmin();

  let parsed;
  try {
    parsed = parseAdmitidosDesligados(conteudo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao processar o arquivo." };
  }

  const preview = await montarPreview(conteudo);
  if (preview.error || !preview.data) return { error: preview.error ?? "Erro ao processar o arquivo." };

  const { empresaId, tipo, linhas, syncFuncionarios, transferenciaComOnus } = preview.data;
  const setor = await resolverSetorAprendiz();
  if (!setor) return { error: 'Não encontrei o cargo "Aprendiz" cadastrado.' };

  const campo = tipo === "admitidos" ? "aprendizesAdmitidos" : "aprendizesDesligados";

  let competenciasAtualizadas = 0;
  let competenciasSemIndicador = 0;
  let transferenciaAtualizada = 0;

  await prisma.$transaction(async (tx) => {
    for (const linha of linhas) {
      const resultado = await tx.indicadorMensal.updateMany({
        where: { empresaId, setor, competencia: linha.competencia },
        data: { [campo]: linha.quantidade },
      });
      if (resultado.count > 0) competenciasAtualizadas++;
      else competenciasSemIndicador++;
    }

    for (const t of transferenciaComOnus) {
      const resultado = await tx.indicadorMensal.updateMany({
        where: { empresaId, setor: t.setor, competencia: t.competencia },
        data: { desligadosTransferencia: t.quantidade },
      });
      if (resultado.count > 0) transferenciaAtualizada += t.quantidade;
    }

    if (syncFuncionarios) {
      const eventosComData = parsed.linhas.filter(
        (l): l is EventoLinha & { matricula: string; dataEvento: Date } => l.matricula !== null && l.dataEvento !== null
      );
      for (const alvo of syncFuncionarios.paraAtualizar) {
        // Casado por nome (TXT) — a data exata não veio no arquivo, usa o dia 1 do mês/ano como
        // aproximação (o dia certo precisa ser confirmado depois no cadastro, principalmente se
        // o desligamento foi perto do fim do mês, que muda a regra do VR proporcional).
        const evento = alvo.diaAproximado ? null : eventosComData.find((e) => e.matricula === alvo.matricula);
        const dataDesligamento = alvo.diaAproximado
          ? alvo.competencia
            ? competenciaParaData(alvo.competencia)
            : null
          : (evento?.dataEvento ?? null);
        if (!dataDesligamento) continue;
        await tx.funcionario.updateMany({
          where: { empresaId, matricula: alvo.matricula },
          data: { status: "desligado", dataDesligamento, ...(evento?.motivo ? { motivoDesligamento: evento.motivo } : {}) },
        });
      }
      // Quem já estava desligado no sistema (ex.: marcado pelo cadastro) também recebe o motivo —
      // é ele que os indicadores usam pra identificar transferência com ônus.
      for (const e of eventosComData) {
        if (!e.motivo) continue;
        await tx.funcionario.updateMany({
          where: { empresaId, matricula: e.matricula, status: "desligado", motivoDesligamento: null },
          data: { motivoDesligamento: e.motivo },
        });
      }
    }

    await tx.importacao.create({
      data: {
        empresaId,
        tipo: tipo === "admitidos" ? "movimentacao_aprendiz_admitidos" : "movimentacao_aprendiz_desligados",
        importadoPorId: admin.id,
        nomeArquivo,
        competencia: linhas.map((l) => l.competencia).join(", ") || "-",
        criados: 0,
        atualizados: competenciasAtualizadas + (syncFuncionarios?.paraAtualizar.length ?? 0),
        naoEncontrados:
          syncFuncionarios && syncFuncionarios.naoEncontrados.length > 0
            ? JSON.stringify(syncFuncionarios.naoEncontrados)
            : null,
      },
    });
  });

  return {
    error: null,
    resumo: {
      competenciasAtualizadas,
      competenciasSemIndicador,
      funcionariosDesligados: syncFuncionarios?.paraAtualizar.length ?? 0,
      funcionariosNaoEncontrados: syncFuncionarios?.naoEncontrados.length ?? 0,
      transferenciaComOnus: transferenciaAtualizada,
    },
  };
}
