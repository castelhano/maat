export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
export const ANOS = Array.from({ length: 6 }, (_, i) => String(ANO_ATUAL + 1 - i));

// Sempre abre na competência do mês corrente (calendário atual) — quem processa/fecha o mês
// anterior faz isso pelo seletor de competência mesmo, não precisa que a tela abra nele.
export function competenciaPadrao(): { mes: string; ano: string } {
  const hoje = new Date();
  return { mes: String(hoje.getMonth() + 1).padStart(2, "0"), ano: String(hoje.getFullYear()) };
}

// A partir de que dia do mês SEGUINTE ao da competência ela é considerada fechada pra
// reprocessamento (folha/benefícios já pagos até lá) — evita reprocessar sem querer um mês que
// já foi fechado e enviado.
const DIA_LIMITE_REPROCESSAMENTO = 8;

export function competenciaEstaFechada(competencia: { ano: number; mes: number }, agora: Date = new Date()): boolean {
  let mesSeguinte = competencia.mes + 1;
  let anoSeguinte = competencia.ano;
  if (mesSeguinte > 12) {
    mesSeguinte = 1;
    anoSeguinte += 1;
  }
  const limite = new Date(anoSeguinte, mesSeguinte - 1, DIA_LIMITE_REPROCESSAMENTO);
  const hojeSemHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return hojeSemHora >= limite;
}
