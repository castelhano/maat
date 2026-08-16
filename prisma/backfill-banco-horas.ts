import "dotenv/config";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { parseBancoHorasSaldoInicial } from "../src/lib/parsers/banco-horas";
import { processarHistorico, type CompetenciaEntrada } from "../src/lib/banco-horas";

// Uso:
//   tsx prisma/backfill-banco-horas.ts <saldo-inicial.txt> <Saldo BH.csv> [--commit] [--empresa=005]
//
// Fonte de crédito/débito: "Saldo BH.csv" (colunas MAT;SALDO;CREDITO;DEBITO;PAGAR;BANCO), por
// decisão do usuário — diverge em pontos isolados do extrato TXT original e o CSV foi escolhido
// como fonte de verdade pra esses casos.
//
// Sem --commit: modo de conferência — mostra o cálculo mês a mês de 5 matrículas de amostra e um
// resumo geral, sem gravar nada no banco.
// Com --commit: persiste BancoHorasSaldoInicial + BancoHorasApuracao + BancoHorasLoteCredito +
// BancoHorasImportacao pra todos os funcionários encontrados.

const args = process.argv.slice(2);
const posicionais = args.filter((a) => !a.startsWith("--"));
const commit = args.includes("--commit");
const codigoEmpresa = args.find((a) => a.startsWith("--empresa="))?.split("=")[1] ?? "005";

const [saldoPath, csvPath] = posicionais;
if (!saldoPath || !csvPath) {
  console.error("Uso: tsx prisma/backfill-banco-horas.ts <saldo-inicial.txt> <Saldo BH.csv> [--commit]");
  process.exit(1);
}

const MESES_ABREV: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

type LinhaCsv = { matricula: string; competencia: string; credito: number; debito: number; banco: number };

function parseCsv(conteudo: string): LinhaCsv[] {
  // ";MAT;SALDO;CREDITO;DEBITO;PAGAR;BANCO"
  const linhas: LinhaCsv[] = [];
  for (const linha of conteudo.split(/\r?\n/).slice(1)) {
    if (!linha.trim()) continue;
    const [mesAno, mat, , credito, debito, , banco] = linha.split(";");
    const [abrev, ano2] = mesAno.split("/");
    const mes = MESES_ABREV[abrev.toLowerCase()];
    if (!mes) continue;
    linhas.push({
      matricula: mat.padStart(6, "0"),
      competencia: `${mes}/20${ano2}`,
      credito: Number(credito.replace(",", ".")),
      debito: Number(debito.replace(",", ".")),
      banco: Number(banco.replace(",", ".")),
    });
  }
  return linhas;
}

function compararCompetencias(a: string, b: string): number {
  const [ma, aa] = a.split("/").map(Number);
  const [mb, ab] = b.split("/").map(Number);
  return aa !== ab ? aa - ab : ma - mb;
}

const MATRICULAS_AMOSTRA = ["001028", "002401", "002796", "001489", "003504"];

function fmtHoras(decimal: number): string {
  const neg = decimal < 0;
  const abs = Math.abs(decimal);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${neg ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

async function main() {
  const saldoLinhas = parseBancoHorasSaldoInicial(readFileSync(saldoPath, "utf8"));
  const csvLinhas = parseCsv(readFileSync(csvPath, "utf8"));

  const saldoPorMatricula = new Map(saldoLinhas.map((l) => [l.matricula, l.saldoDecimal]));
  const competenciasPorMatricula = new Map<string, CompetenciaEntrada[]>();
  const bancoReferenciaPorMatricula = new Map<string, Map<string, number>>();
  for (const l of csvLinhas) {
    const lista = competenciasPorMatricula.get(l.matricula) ?? [];
    lista.push({ competencia: l.competencia, creditoDecimal: l.credito, debitoDecimal: l.debito });
    competenciasPorMatricula.set(l.matricula, lista);

    if (!bancoReferenciaPorMatricula.has(l.matricula)) bancoReferenciaPorMatricula.set(l.matricula, new Map());
    bancoReferenciaPorMatricula.get(l.matricula)!.set(l.competencia, l.banco);
  }
  const todasCompetencias = [...new Set(csvLinhas.map((l) => l.competencia))].sort(compararCompetencias);
  const periodoInicio = todasCompetencias[0];
  const periodoFim = todasCompetencias[todasCompetencias.length - 1];

  // A regra de paridade do saldo negativo precisa avançar mês a mês em sequência: uma competência
  // sem movimento não aparece no CSV, mas ainda "acontece" pro motor de cálculo (regra c continua
  // valendo mesmo sem crédito/débito naquele mês). Preenche os meses ausentes com zero.
  for (const [matricula, lista] of competenciasPorMatricula) {
    const presentes = new Set(lista.map((c) => c.competencia));
    for (const competencia of todasCompetencias) {
      if (!presentes.has(competencia)) {
        lista.push({ competencia, creditoDecimal: 0, debitoDecimal: 0 });
      }
    }
    lista.sort((a, b) => compararCompetencias(a.competencia, b.competencia));
    competenciasPorMatricula.set(matricula, lista);
  }

  const empresa = await prisma.empresa.findUnique({ where: { codigo: codigoEmpresa } });
  if (!empresa) throw new Error(`Empresa ${codigoEmpresa} não encontrada. Importe a folha de salários antes.`);

  const funcionarios = await prisma.funcionario.findMany({
    where: { empresaId: empresa.id, matricula: { in: [...competenciasPorMatricula.keys()] } },
    select: { id: true, matricula: true, nome: true },
  });
  const funcPorMatricula = new Map(funcionarios.map((f) => [f.matricula, f]));

  const naoEncontrados = [...competenciasPorMatricula.keys()].filter((m) => !funcPorMatricula.has(m));

  console.log(`Empresa: ${empresa.codigo} - ${empresa.nome}`);
  console.log(`Período: ${periodoInicio} a ${periodoFim}`);
  console.log(`Matrículas no CSV: ${competenciasPorMatricula.size}`);
  console.log(`Encontradas no cadastro de funcionários: ${funcPorMatricula.size}`);
  if (naoEncontrados.length > 0) {
    console.log(`Não encontradas (${naoEncontrados.length}):`, naoEncontrados.join(", "));
  }

  // Conferência automática contra a própria coluna BANCO do CSV (deve bater quase 100%, exceto
  // mar/abr onde a regra de paridade documentada no plano diverge da planilha legada — combinado
  // com o usuário).
  let comparados = 0;
  let ok = 0;
  const divergencias: string[] = [];
  for (const [matricula, competencias] of competenciasPorMatricula) {
    const saldoInicial = saldoPorMatricula.get(matricula) ?? 0;
    const { apuracoes } = processarHistorico(saldoInicial, competencias);
    const referencia = bancoReferenciaPorMatricula.get(matricula)!;
    for (const a of apuracoes) {
      const refValor = referencia.get(a.competencia);
      if (refValor === undefined) continue;
      comparados++;
      const diff = Math.abs(a.saldoFinalDecimal - refValor);
      if (diff < 0.01) ok++;
      else divergencias.push(`${matricula} ${a.competencia}: calculado=${a.saldoFinalDecimal.toFixed(4)} csv=${refValor.toFixed(4)}`);
    }
  }
  console.log(`\nConferência contra a coluna BANCO do CSV: ${ok}/${comparados} batendo.`);
  if (divergencias.length > 0) {
    console.log(`Divergentes (${divergencias.length}), esperado ~ mar/abr pela exceção de paridade já combinada:`);
    console.log(divergencias.filter((d) => !d.includes(" 03/2026") && !d.includes(" 04/2026")).join("\n") || "  (todas em mar/abr, como esperado)");
  }

  if (!commit) {
    console.log("\n=== MODO CONFERÊNCIA (nada foi gravado) ===\n");
    for (const matricula of MATRICULAS_AMOSTRA) {
      const func = funcPorMatricula.get(matricula);
      const competencias = competenciasPorMatricula.get(matricula);
      if (!func || !competencias) {
        console.log(`Matrícula ${matricula}: sem dados no CSV ou não encontrada — pulando amostra.`);
        continue;
      }
      const saldoInicial = saldoPorMatricula.get(matricula) ?? 0;
      const { apuracoes } = processarHistorico(saldoInicial, competencias);

      console.log(`\n${matricula} — ${func.nome}`);
      console.log(`  saldo dez/2025 (abertura): ${fmtHoras(saldoInicial)}`);
      console.log(
        "  competência | crédito bruto | débito bruto | crédito líquido | pago no mês | saldo positivo | saldo negativo | saldo final"
      );
      for (const a of apuracoes) {
        console.log(
          `  ${a.competencia}      | ${fmtHoras(a.creditoBrutoDecimal).padStart(7)}       | ${fmtHoras(a.debitoBrutoDecimal).padStart(7)}      | ${fmtHoras(a.creditoLiquidoDecimal).padStart(7)}         | ${fmtHoras(a.pagoNoMesDecimal).padStart(7)}    | ${fmtHoras(a.saldoPositivoDecimal).padStart(7)}       | ${fmtHoras(a.saldoNegativoDecimal).padStart(7)}       | ${fmtHoras(a.saldoFinalDecimal).padStart(7)}`
        );
      }
    }
    console.log("\nRode de novo com --commit para gravar no banco de dados.");
    return;
  }

  console.log("\n=== GRAVANDO NO BANCO DE DADOS ===\n");
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Nenhum usuário admin encontrado para registrar a importação.");

  let funcionariosProcessados = 0;
  let apuracoesGravadas = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const [matricula, competencias] of competenciasPorMatricula) {
        const func = funcPorMatricula.get(matricula);
        if (!func) continue;

        const saldoInicial = saldoPorMatricula.get(matricula) ?? 0;
        const { apuracoes } = processarHistorico(saldoInicial, competencias);

        await tx.bancoHorasSaldoInicial.upsert({
          where: { funcionarioId: func.id },
          create: { funcionarioId: func.id, competencia: "12/2025", saldoDecimal: saldoInicial },
          update: { saldoDecimal: saldoInicial },
        });

        for (const a of apuracoes) {
          await tx.bancoHorasApuracao.upsert({
            where: { funcionarioId_competencia: { funcionarioId: func.id, competencia: a.competencia } },
            create: {
              funcionarioId: func.id,
              competencia: a.competencia,
              creditoBruto: a.creditoBrutoDecimal,
              debitoBruto: a.debitoBrutoDecimal,
              creditoLiquido: a.creditoLiquidoDecimal,
              pagoNoMes: a.pagoNoMesDecimal,
              saldoPositivo: a.saldoPositivoDecimal,
              saldoNegativo: a.saldoNegativoDecimal,
              saldoFinal: a.saldoFinalDecimal,
            },
            update: {
              creditoBruto: a.creditoBrutoDecimal,
              debitoBruto: a.debitoBrutoDecimal,
              creditoLiquido: a.creditoLiquidoDecimal,
              pagoNoMes: a.pagoNoMesDecimal,
              saldoPositivo: a.saldoPositivoDecimal,
              saldoNegativo: a.saldoNegativoDecimal,
              saldoFinal: a.saldoFinalDecimal,
            },
          });
          apuracoesGravadas++;
        }

        funcionariosProcessados++;
      }

      await tx.bancoHorasImportacao.create({
        data: {
          empresaId: empresa.id,
          importadoPorId: admin.id,
          nomeArquivo: csvPath,
          periodoInicio,
          periodoFim,
          criados: funcionariosProcessados,
          atualizados: 0,
          naoEncontrados: naoEncontrados.length > 0 ? JSON.stringify(naoEncontrados) : null,
        },
      });
    },
    { timeout: 60_000 }
  );

  console.log(`Funcionários processados: ${funcionariosProcessados}`);
  console.log(`Apurações gravadas: ${apuracoesGravadas}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
