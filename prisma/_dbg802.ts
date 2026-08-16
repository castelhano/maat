import "dotenv/config";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { processarHistorico, type CompetenciaEntrada } from "../src/lib/banco-horas";

function parseCsv(conteudo: string) {
  const MESES: Record<string, string> = { jan:"01",fev:"02",mar:"03",abr:"04",mai:"05",jun:"06",jul:"07",ago:"08",set:"09",out:"10",nov:"11",dez:"12" };
  const out: CompetenciaEntrada[] = [];
  for (const linha of conteudo.split(/\r?\n/).slice(1)) {
    if (!linha.trim()) continue;
    const [mesAno, mat, , credito, debito] = linha.split(";");
    if (mat.padStart(6,"0") !== "000802") continue;
    const [ab, ano2] = mesAno.split("/");
    out.push({ competencia: `${MESES[ab.toLowerCase()]}/20${ano2}`, creditoDecimal: Number(credito.replace(",",".")), debitoDecimal: Number(debito.replace(",",".")) });
  }
  return out;
}

async function main() {
  const serie = parseCsv(readFileSync("Saldo BH.csv", "utf8"));
  const { apuracoes } = processarHistorico(0, serie); // saldo inicial 000802 era 0 (nao consta no saldo dez2025.txt como negativo relevante, checar)
  for (const a of apuracoes) console.log(a.competencia, a.saldoPositivoDecimal.toFixed(4), a.saldoNegativoDecimal.toFixed(4), a.saldoFinalDecimal.toFixed(4));
}
main().finally(() => prisma.$disconnect());
