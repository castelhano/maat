export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
export const ANOS = Array.from({ length: 6 }, (_, i) => String(ANO_ATUAL + 1 - i));

// Até dia 10, o usuário provavelmente ainda está fechando o mês anterior — só depois disso
// assume que a competência corrente é a que interessa.
export function competenciaPadrao(): { mes: string; ano: string } {
  const hoje = new Date();
  let mes = hoje.getMonth() + 1;
  let ano = hoje.getFullYear();
  if (hoje.getDate() <= 10) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  return { mes: String(mes).padStart(2, "0"), ano: String(ano) };
}
