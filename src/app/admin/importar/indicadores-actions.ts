"use server";

import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";
import { extrairTextoPdf } from "@/lib/pdf";
import { parseResumoGerencial } from "@/lib/parsers/resumo-gerencial";
import { CAMPOS_INDICADOR, type CampoIndicador } from "@/lib/indicadores";
import { MOTIVO_TRANSFERENCIA_COM_ONUS } from "@/lib/parsers/admitidos-desligados";

const FUNCAO_APRENDIZ = "APRENDIZ";

export type PreviewIndicadorLinha = { setor: string } & Record<CampoIndicador, number | null>;

export type PreviewIndicadoresResult = {
  empresaId: string;
  empresaNome: string;
  competencia: string;
  linhas: PreviewIndicadorLinha[];
};

export async function previewIndicadores(
  pdfBase64: string
): Promise<{ data: PreviewIndicadoresResult | null; error: string | null }> {
  await requirePermissao("importar", "operar");

  let parsed;
  try {
    const bytes = Buffer.from(pdfBase64, "base64");
    const texto = await extrairTextoPdf(bytes);
    parsed = parseResumoGerencial(texto);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Erro ao processar o PDF." };
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: parsed.empresaCodigo } });
  if (!empresa) {
    return {
      data: null,
      error: `Empresa ${parsed.empresaCodigo} ainda não está cadastrada — importe o cadastro dela antes.`,
    };
  }

  // O PDF não traz aprendizes nem transferências com ônus — em vez de deixar zerado, preenche com
  // o que o cadastro já sabe (admissão, desligamento e motivo), ainda editável na conferência.
  const movimentacao = await movimentacaoDoCadastro(empresa.id, parsed.competencia);
  const linhas = parsed.linhas.map((l) => {
    const calc = movimentacao.get(l.setor);
    const preenchida = { ...l };
    for (const campo of CAMPOS_DO_CADASTRO) {
      if (preenchida[campo] === null) preenchida[campo] = calc?.[campo] ?? 0;
    }
    return preenchida;
  });

  return {
    data: { empresaId: empresa.id, empresaNome: empresa.nome, competencia: parsed.competencia, linhas },
    error: null,
  };
}

const CAMPOS_DO_CADASTRO = [
  "aprendizesAtivos",
  "aprendizesAdmitidos",
  "aprendizesDesligados",
  "desligadosTransferencia",
] as const satisfies readonly CampoIndicador[];

type MovimentacaoSetor = Record<(typeof CAMPOS_DO_CADASTRO)[number], number>;

// Conta, por setor (do cargo), quem é aprendiz ativo no fim do mês, aprendiz admitido/desligado no
// mês e desligado no mês por transferência com ônus (este último sem contar aprendiz, que já sai
// da conta do turnover por aprendizesDesligados).
async function movimentacaoDoCadastro(empresaId: string, competencia: string): Promise<Map<string, MovimentacaoSetor>> {
  const [mes, ano] = competencia.split("/").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));
  const noMes = (d: Date | null) => d !== null && d >= inicio && d < fim;

  const funcionarios = await prisma.funcionario.findMany({
    where: { empresaId },
    select: {
      dataAdmissao: true,
      dataDesligamento: true,
      status: true,
      motivoDesligamento: true,
      cargo: { select: { nome: true, setor: true } },
    },
  });

  const resultado = new Map<string, MovimentacaoSetor>();
  const somar = (setor: string | null, campo: keyof MovimentacaoSetor) => {
    if (!setor) return;
    const atual = resultado.get(setor) ?? {
      aprendizesAtivos: 0,
      aprendizesAdmitidos: 0,
      aprendizesDesligados: 0,
      desligadosTransferencia: 0,
    };
    atual[campo]++;
    resultado.set(setor, atual);
  };

  for (const f of funcionarios) {
    const setor = f.cargo.setor;
    const aprendiz = f.cargo.nome.toUpperCase() === FUNCAO_APRENDIZ;
    if (aprendiz) {
      if (noMes(f.dataAdmissao)) somar(setor, "aprendizesAdmitidos");
      if (noMes(f.dataDesligamento)) somar(setor, "aprendizesDesligados");
      const saiuAteOFim = f.dataDesligamento ? f.dataDesligamento < fim : f.status === "desligado";
      if (f.dataAdmissao < fim && !saiuAteOFim) somar(setor, "aprendizesAtivos");
    } else if (noMes(f.dataDesligamento) && f.motivoDesligamento && MOTIVO_TRANSFERENCIA_COM_ONUS.test(f.motivoDesligamento)) {
      somar(setor, "desligadosTransferencia");
    }
  }

  return resultado;
}

export type IndicadorLinhaEditada = { setor: string; camposManuais: CampoIndicador[] } & Record<
  CampoIndicador,
  number
>;

export async function confirmarIndicadores(
  empresaId: string,
  competencia: string,
  nomeArquivo: string,
  linhas: IndicadorLinhaEditada[]
): Promise<{ error: string | null; resumo?: { gravados: number } }> {
  const admin = await requirePermissao("importar", "operar");

  if (!competencia.trim()) return { error: "Competência não informada." };
  if (linhas.length === 0) return { error: "Nenhuma área pra gravar." };

  // Campo que não veio do PDF chega zerado do cliente (não bloqueia a confirmação) — só
  // `camposManuais` registra quais foram assim, pra aparecer sinalizado na tela depois.
  for (const linha of linhas) {
    for (const campo of CAMPOS_INDICADOR) {
      if (typeof linha[campo] !== "number" || Number.isNaN(linha[campo])) {
        return { error: `Valor inválido no campo "${campo}" da área ${linha.setor}.` };
      }
    }
  }

  const resumo = await prisma.$transaction(async (tx) => {
    for (const linha of linhas) {
      const dados = {} as Record<CampoIndicador, number> & { camposManuais: string | null; importadoPorId: string };
      for (const campo of CAMPOS_INDICADOR) dados[campo] = linha[campo];
      dados.camposManuais = linha.camposManuais.length > 0 ? JSON.stringify(linha.camposManuais) : null;
      dados.importadoPorId = admin.id;

      await tx.indicadorMensal.upsert({
        where: { empresaId_setor_competencia: { empresaId, setor: linha.setor, competencia } },
        create: { empresaId, setor: linha.setor, competencia, ...dados },
        update: dados,
      });
    }

    await tx.importacao.create({
      data: {
        empresaId,
        tipo: "indicadores_mensais",
        importadoPorId: admin.id,
        nomeArquivo,
        competencia,
        criados: linhas.length,
        atualizados: 0,
        naoEncontrados: null,
      },
    });

    return { gravados: linhas.length };
  });

  return { error: null, resumo };
}
