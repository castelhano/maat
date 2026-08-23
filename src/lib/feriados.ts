// Feriados nacionais fixos + móveis (baseados na Páscoa) do Brasil. Feriados municipais/estaduais
// não são considerados aqui — se a folha de pagamento da empresa observar algum feriado local,
// ajuste a data manualmente na tela.

function pascoa(ano: number): Date {
  // Algoritmo Anonymous Gregorian / Meeus.
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function addDias(d: Date, dias: number) {
  return new Date(d.getTime() + dias * 86_400_000);
}

export function feriadosNacionais(ano: number): Date[] {
  const p = pascoa(ano);
  return [
    new Date(Date.UTC(ano, 0, 1)), // confraternização universal
    addDias(p, -47), // carnaval (terça-feira)
    addDias(p, -2), // sexta-feira santa
    addDias(p, 60), // corpus christi
    new Date(Date.UTC(ano, 3, 21)), // tiradentes
    new Date(Date.UTC(ano, 4, 1)), // dia do trabalho
    new Date(Date.UTC(ano, 8, 7)), // independência
    new Date(Date.UTC(ano, 9, 12)), // n. sra. aparecida
    new Date(Date.UTC(ano, 10, 2)), // finados
    new Date(Date.UTC(ano, 10, 15)), // proclamação da república
    new Date(Date.UTC(ano, 10, 20)), // consciência negra (feriado nacional desde 2024)
    new Date(Date.UTC(ano, 11, 25)), // natal
  ];
}

export function ehDiaUtil(data: Date): boolean {
  const diaSemana = data.getUTCDay(); // 0 = domingo, 6 = sábado
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !feriadosNacionais(data.getUTCFullYear()).some((f) => f.getTime() === data.getTime());
}

// Anda pra trás a partir de `data` até achar um dia útil. Usado pra antecipar o pagamento das
// férias quando a data cai em fim de semana/feriado — a lei exige pagar ATÉ 2 dias antes do
// início do gozo, então o ajuste sempre antecipa, nunca atrasa.
export function diaUtilAnterior(data: Date): Date {
  let d = data;
  while (!ehDiaUtil(d)) d = addDias(d, -1);
  return d;
}

export function dataPagamentoFerias(gozoInicio: Date): Date {
  return diaUtilAnterior(addDias(gozoInicio, -2));
}
