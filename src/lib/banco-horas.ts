// Motor de cálculo do Banco de Horas — ver BANCO_DE_HORAS_PLANO.md (regras 1-8).
//
// Fórmula validada por engenharia reversa contra "Saldo BH.csv" (histórico real jan-jul/2026 da
// Pantanal, conferido pelo usuário direto na fonte original) — bate 100% (898/898 linhas):
//
//   creditoLiquido = creditoBruto / 2   (metade exata, sem arredondar pra cima)
//
//   Se o saldo anterior sozinho já cobre o débito do mês:
//     saldoFinal = creditoLiquido                              (só a metade nova fica no banco)
//     pagoNoMes  = saldoAnterior + creditoLiquido - débito      (o resto sai / é pago)
//   Senão (débito consome também o crédito novo, ou vai além):
//     saldoFinal = saldoAnterior + creditoLiquido - débito      (roda normalmente)
//     pagoNoMes  = creditoLiquido                                (só a metade automática de sempre)
//
//   Paridade (regra c do plano): ao ENTRAR num mês ímpar, se o saldo anterior é negativo, zera
//   antes de aplicar a fórmula acima; mês par mantém como está. Essa regra sozinha explica 100%
//   das zeragens observadas no histórico real (inclusive a marco-zero dez/2025 → jan/2026) — não
//   há exceção nem lote/FIFO/expiração envolvidos; é só essa fórmula de troca de "quem fica no
//   banco vs quem é pago", mês a mês, sobre um único número corrido.
//
// Uma versão anterior deste motor modelava lotes de crédito com FIFO e expiração de 1 mês —
// parecia bater ~88% dos dados, mas isso era efeito colateral de uma leitura errada de qual coluna
// do CSV era "A Pagar" e qual era "Banco". Corrigido e re-validado a 100% em 2026-08-16.

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
  saldoPositivoDecimal: number; // max(saldoFinal, 0) — só pra exibição/relatório
  saldoNegativoDecimal: number; // min(saldoFinal, 0) — só pra exibição/relatório
  saldoFinalDecimal: number;
};

function mesDaCompetencia(competencia: string): number {
  return Number(competencia.split("/")[0]);
}

function compararCompetencias(a: string, b: string): number {
  const [ma, aa] = a.split("/").map(Number);
  const [mb, ab] = b.split("/").map(Number);
  return aa !== ab ? aa - ab : ma - mb;
}

/** Processa uma única competência a partir do saldo de fechamento da competência anterior. */
export function processarCompetencia(
  saldoAnteriorDecimal: number,
  entrada: CompetenciaEntrada
): { saldoFinalDecimal: number; apuracao: ApuracaoMes } {
  const mesAtual = mesDaCompetencia(entrada.competencia);

  // Regra c: paridade, aplicada na ENTRADA da competência.
  let saldoAnterior = saldoAnteriorDecimal;
  if (mesAtual % 2 !== 0 && saldoAnterior < 0) {
    saldoAnterior = 0; // mês ímpar: zera o negativo herdado
  }
  // mês par, ou saldo anterior não-negativo: mantém como está.

  const creditoBrutoDecimal = Math.max(0, entrada.creditoDecimal);
  const debitoBrutoDecimal = Math.max(0, entrada.debitoDecimal);
  const creditoLiquidoDecimal = creditoBrutoDecimal / 2;

  let saldoFinalDecimal: number;
  let pagoNoMesDecimal: number;
  if (saldoAnterior >= debitoBrutoDecimal) {
    saldoFinalDecimal = creditoLiquidoDecimal;
    pagoNoMesDecimal = saldoAnterior + creditoLiquidoDecimal - debitoBrutoDecimal;
  } else {
    saldoFinalDecimal = saldoAnterior + creditoLiquidoDecimal - debitoBrutoDecimal;
    pagoNoMesDecimal = creditoLiquidoDecimal;
  }

  return {
    saldoFinalDecimal,
    apuracao: {
      competencia: entrada.competencia,
      creditoBrutoDecimal,
      debitoBrutoDecimal,
      creditoLiquidoDecimal,
      pagoNoMesDecimal,
      saldoPositivoDecimal: Math.max(saldoFinalDecimal, 0),
      saldoNegativoDecimal: Math.min(saldoFinalDecimal, 0),
      saldoFinalDecimal,
    },
  };
}

/** Processa uma sequência de competências em ordem cronológica a partir do saldo de dez/2025. */
export function processarHistorico(
  saldoInicialDecimal: number,
  competencias: CompetenciaEntrada[]
): { apuracoes: ApuracaoMes[]; saldoFinalDecimal: number } {
  const ordenadas = [...competencias].sort((a, b) => compararCompetencias(a.competencia, b.competencia));
  let saldo = saldoInicialDecimal;
  const apuracoes: ApuracaoMes[] = [];
  for (const entrada of ordenadas) {
    const resultado = processarCompetencia(saldo, entrada);
    saldo = resultado.saldoFinalDecimal;
    apuracoes.push(resultado.apuracao);
  }
  return { apuracoes, saldoFinalDecimal: saldo };
}
