// Motor de cálculo do Banco de Horas — ver BANCO_DE_HORAS_PLANO.md (regras 1-8).
//
// Trabalha inteiramente em horas decimais, sem arredondamento em nenhuma etapa — conferido
// contra "Saldo BH.csv" (histórico real jan-jul/2026 da Pantanal): o crédito líquido é a metade
// exata do bruto (sem arredondar pra cima como o rascunho original do plano previa).
//
// Decisões tomadas com o usuário, também conferidas contra o CSV:
// - o saldo positivo herdado de dez/2025 conta como um lote de origem "12/2025", sujeito à mesma
//   regra de expiração de 1 mês que qualquer outro lote (confere: bate com o histórico de
//   funcionários que só recebem crédito, ex. matrícula 001489);
// - a regra de paridade do saldo negativo (mês par mantém, mês ímpar zera) é aplicada literalmente
//   mês a mês, incluindo a entrada em jan/2026. O CSV diverge dessa regra especificamente na
//   transição fev→mar (não zera, mesmo mar sendo ímpar) — o usuário confirmou que é uma
//   inconsistência da planilha legada antiga, não uma regra de negócio real, e pediu pra manter a
//   regra do plano como está documentada.

export type LoteCreditoEstado = {
  competenciaOrigem: string; // "MM/AAAA" ou "12/2025" pro saldo inicial
  valorOriginalDecimal: number;
  valorConsumidoDecimal: number;
  status: "aberto" | "consumido" | "expirado_pago";
};

export type EstadoBancoHoras = {
  lotes: LoteCreditoEstado[];
  saldoNegativoDecimal: number; // sempre <= 0
};

export type CompetenciaEntrada = {
  competencia: string; // "MM/AAAA"
  creditoDecimal: number; // horas
  debitoDecimal: number; // horas
};

export type ApuracaoMes = {
  competencia: string;
  creditoBrutoDecimal: number;
  debitoBrutoDecimal: number;
  creditoLiquidoDecimal: number;
  pagoNoMesDecimal: number;
  saldoPositivoDecimal: number;
  saldoNegativoDecimal: number;
  saldoFinalDecimal: number;
};

function mesDaCompetencia(competencia: string): number {
  return Number(competencia.split("/")[0]);
}

function competenciaAnterior(competencia: string): string {
  let [mes, ano] = competencia.split("/").map(Number);
  mes -= 1;
  if (mes === 0) {
    mes = 12;
    ano -= 1;
  }
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

function compararCompetencias(a: string, b: string): number {
  const [ma, aa] = a.split("/").map(Number);
  const [mb, ab] = b.split("/").map(Number);
  return aa !== ab ? aa - ab : ma - mb;
}

/** Estado no marco zero (fechamento de dez/2025), a partir do saldo hardcoded por funcionário. */
export function estadoInicial(saldoInicialDecimal: number): EstadoBancoHoras {
  if (saldoInicialDecimal > 0) {
    return {
      lotes: [
        {
          competenciaOrigem: "12/2025",
          valorOriginalDecimal: saldoInicialDecimal,
          valorConsumidoDecimal: 0,
          status: "aberto",
        },
      ],
      saldoNegativoDecimal: 0,
    };
  }
  return { lotes: [], saldoNegativoDecimal: saldoInicialDecimal < 0 ? saldoInicialDecimal : 0 };
}

/** Processa uma única competência a partir do estado de fechamento da competência anterior. */
export function processarCompetencia(
  estado: EstadoBancoHoras,
  entrada: CompetenciaEntrada
): { estado: EstadoBancoHoras; apuracao: ApuracaoMes; lotesEncerradosNoMes: LoteCreditoEstado[] } {
  const mesAtual = mesDaCompetencia(entrada.competencia);
  let saldoNegativoDecimal = estado.saldoNegativoDecimal;

  // Regra c: paridade do saldo negativo, aplicada na ENTRADA da competência.
  if (mesAtual % 2 !== 0) {
    saldoNegativoDecimal = 0; // mês ímpar: zera o negativo herdado
  }
  // mês par: mantém como está.

  const creditoBrutoDecimal = Math.max(0, entrada.creditoDecimal);
  const debitoBrutoDecimal = Math.max(0, entrada.debitoDecimal);

  // Regra 2: crédito líquido = metade exata do bruto; a outra metade é paga automaticamente.
  const creditoLiquidoDecimal = creditoBrutoDecimal / 2;
  const pagoCreditoMesDecimal = creditoBrutoDecimal - creditoLiquidoDecimal;

  let lotes = estado.lotes.map((l) => ({ ...l }));
  if (creditoLiquidoDecimal > 0) {
    lotes.push({
      competenciaOrigem: entrada.competencia,
      valorOriginalDecimal: creditoLiquidoDecimal,
      valorConsumidoDecimal: 0,
      status: "aberto",
    });
  }

  // Regra 3: débito consome o lote mais antigo primeiro (FIFO).
  lotes.sort((a, b) => compararCompetencias(a.competenciaOrigem, b.competenciaOrigem));
  // "12/2025" ordena antes de qualquer "MM/2026" porque comparamos ano primeiro (2025 < 2026).
  let debitoRestanteDecimal = debitoBrutoDecimal;
  for (const lote of lotes) {
    if (debitoRestanteDecimal <= 0) break;
    const disponivel = lote.valorOriginalDecimal - lote.valorConsumidoDecimal;
    if (disponivel <= 0) continue;
    const consumir = Math.min(disponivel, debitoRestanteDecimal);
    lote.valorConsumidoDecimal += consumir;
    debitoRestanteDecimal -= consumir;
  }

  // Regra 5: excedente de débito vira saldo negativo agregado (não FIFO).
  if (debitoRestanteDecimal > 0) {
    saldoNegativoDecimal -= debitoRestanteDecimal;
  }

  // Regra 4: lote nascido no mês imediatamente anterior expira no fechamento deste mês.
  const mesAnterior = competenciaAnterior(entrada.competencia);
  let pagoExpiracaoMesDecimal = 0;
  for (const lote of lotes) {
    if (lote.competenciaOrigem === mesAnterior) {
      const restante = lote.valorOriginalDecimal - lote.valorConsumidoDecimal;
      if (restante > 0) {
        pagoExpiracaoMesDecimal += restante;
        lote.valorConsumidoDecimal = lote.valorOriginalDecimal;
      }
      lote.status = "expirado_pago";
    }
  }
  // Lotes totalmente fechados (consumido ou expirado) não seguem pro próximo mês de trabalho,
  // mas ficam disponíveis em `lotesEncerradosNoMes` pra quem precisar persistir o histórico completo.
  const EPSILON = 1e-9;
  const lotesEncerradosNoMes = lotes.filter((l) => l.valorOriginalDecimal - l.valorConsumidoDecimal <= EPSILON);
  lotes = lotes.filter((l) => l.valorOriginalDecimal - l.valorConsumidoDecimal > EPSILON);
  for (const l of lotesEncerradosNoMes) {
    if (l.status === "aberto") l.status = "consumido";
  }

  const saldoPositivoDecimal = lotes.reduce((acc, l) => acc + (l.valorOriginalDecimal - l.valorConsumidoDecimal), 0);
  const pagoNoMesDecimal = pagoCreditoMesDecimal + pagoExpiracaoMesDecimal;
  const saldoFinalDecimal = saldoPositivoDecimal + saldoNegativoDecimal;

  return {
    estado: { lotes, saldoNegativoDecimal },
    lotesEncerradosNoMes,
    apuracao: {
      competencia: entrada.competencia,
      creditoBrutoDecimal,
      debitoBrutoDecimal,
      creditoLiquidoDecimal,
      pagoNoMesDecimal,
      saldoPositivoDecimal,
      saldoNegativoDecimal,
      saldoFinalDecimal,
    },
  };
}

/** Processa uma sequência de competências em ordem cronológica a partir do saldo de dez/2025. */
export function processarHistorico(
  saldoInicialDecimal: number,
  competencias: CompetenciaEntrada[]
): { apuracoes: ApuracaoMes[]; estadoFinal: EstadoBancoHoras; todosOsLotes: LoteCreditoEstado[] } {
  const ordenadas = [...competencias].sort((a, b) => compararCompetencias(a.competencia, b.competencia));
  let estado = estadoInicial(saldoInicialDecimal);
  const apuracoes: ApuracaoMes[] = [];
  const lotesEncerrados: LoteCreditoEstado[] = [];
  for (const entrada of ordenadas) {
    const resultado = processarCompetencia(estado, entrada);
    estado = resultado.estado;
    apuracoes.push(resultado.apuracao);
    lotesEncerrados.push(...resultado.lotesEncerradosNoMes);
  }
  return { apuracoes, estadoFinal: estado, todosOsLotes: [...lotesEncerrados, ...estado.lotes] };
}
