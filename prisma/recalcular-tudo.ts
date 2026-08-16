import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { processarHistorico, type CompetenciaEntrada } from "../src/lib/banco-horas";

// Recalcula TODO o histórico de banco de horas de todos os funcionários a partir dos dados já
// persistidos (creditoBruto/debitoBruto de cada BancoHorasApuracao + saldo inicial), usando a
// versão atual do motor de cálculo. Útil depois de qualquer ajuste no motor (src/lib/banco-horas.ts)
// pra garantir que o banco reflita a regra mais recente sem precisar reimportar nenhum arquivo.
//
// Uso: tsx prisma/recalcular-tudo.ts [--commit]

const commit = process.argv.includes("--commit");

function compararCompetencias(a: string, b: string): number {
  const [ma, aa] = a.split("/").map(Number);
  const [mb, ab] = b.split("/").map(Number);
  return aa !== ab ? aa - ab : ma - mb;
}

async function main() {
  const funcionarios = await prisma.funcionario.findMany({
    where: { bancoHorasApuracoes: { some: {} } },
    select: { id: true, matricula: true, nome: true },
  });

  console.log(`Funcionários com banco de horas: ${funcionarios.length}`);
  let alterados = 0;
  let apuracoesRecalculadas = 0;

  for (const func of funcionarios) {
    const saldoInicial = await prisma.bancoHorasSaldoInicial.findUnique({ where: { funcionarioId: func.id } });
    const apuracoesExistentes = await prisma.bancoHorasApuracao.findMany({ where: { funcionarioId: func.id } });
    const serie: CompetenciaEntrada[] = apuracoesExistentes
      .map((a) => ({ competencia: a.competencia, creditoDecimal: Number(a.creditoBruto), debitoDecimal: Number(a.debitoBruto) }))
      .sort((a, b) => compararCompetencias(a.competencia, b.competencia));

    const saldoInicialDecimal = saldoInicial ? Number(saldoInicial.saldoDecimal) : 0;
    const { apuracoes } = processarHistorico(saldoInicialDecimal, serie);

    let mudouAlgumaCoisa = false;
    for (const a of apuracoes) {
      const existente = apuracoesExistentes.find((e) => e.competencia === a.competencia)!;
      const diff = Math.abs(Number(existente.saldoFinal) - a.saldoFinalDecimal);
      if (diff > 1e-6) mudouAlgumaCoisa = true;

      if (commit) {
        await prisma.bancoHorasApuracao.update({
          where: { id: existente.id },
          data: {
            creditoLiquido: a.creditoLiquidoDecimal,
            pagoNoMes: a.pagoNoMesDecimal,
            saldoPositivo: a.saldoPositivoDecimal,
            saldoNegativo: a.saldoNegativoDecimal,
            saldoFinal: a.saldoFinalDecimal,
          },
        });
      }
      apuracoesRecalculadas++;
    }

    if (mudouAlgumaCoisa) {
      alterados++;
      console.log(`  ${func.matricula} ${func.nome} — mudou`);
    }

    // O motor não usa mais lotes (ver nota no topo de src/lib/banco-horas.ts) — limpa registros
    // antigos de uma versão anterior do motor, se sobrar algum.
    if (commit) {
      await prisma.bancoHorasLoteCredito.deleteMany({ where: { funcionarioId: func.id } });
    }
  }

  console.log(`\nFuncionários com pelo menos uma competência alterada: ${alterados}`);
  console.log(`Apurações reavaliadas: ${apuracoesRecalculadas}`);
  console.log(commit ? "Gravado." : "Modo conferência — rode com --commit para gravar.");
}

main().finally(() => prisma.$disconnect());
