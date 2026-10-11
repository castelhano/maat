// Motor de apuração de benefícios (cesta básica + vale-refeição). Funções puras — recebem os
// dados já carregados do banco e devolvem o resultado calculado; quem persiste é a camada de
// actions (src/app/admin/beneficios).

const VR_PERCENTUAL = 0.08;
const VR_MINIMO = 225;
const VR_MAXIMO = 520;
const GRATIFICACAO_PERCENTUAL = 0.4;
const DIAS_MINIMOS_NO_MES = 28;
const MESES_CESTA_APOS_AFASTAMENTO = 3;

// Um ciclo de afastamento (fim null = ainda afastado). Veio substituir o par único
// dataAfastamento/dataRetorno do cadastro — alguém pode se afastar e voltar mais de uma vez no
// mesmo mês (ex.: voltou dia 7, se afastou de novo dia 23), e só uma lista de ciclos consegue
// representar isso corretamente.
export type PeriodoAfastamento = { inicio: Date; fim: Date | null; motivo?: string | null };

export type ResultadoCesta = {
  elegivel: boolean;
  motivo: string | null;
};

// O cadastro só guarda o status ATUAL do funcionário — não há histórico mês a mês. Pra apurar
// uma competência passada (ex.: elegibilidade de cesta do mês anterior, usada no crédito
// convertido em VR), o status desligado/afastado só é válido se a data correspondente já tinha
// acontecido naquele mês; senão ele ainda estava ativo então, mesmo já estando desligado/afastado
// hoje.
export function statusNaCompetencia(
  funcionario: { status: string; dataAfastamento: Date | null; dataDesligamento: Date | null },
  competencia: { ano: number; mes: number }
): string {
  const anoMesCompetencia = competencia.ano * 12 + (competencia.mes - 1);

  if (funcionario.status === "desligado" && funcionario.dataDesligamento) {
    const anoMesDesligamento =
      funcionario.dataDesligamento.getUTCFullYear() * 12 + funcionario.dataDesligamento.getUTCMonth();
    if (anoMesDesligamento > anoMesCompetencia) return "ativo";
  }

  if (funcionario.status === "afastado" && funcionario.dataAfastamento) {
    const anoMesAfastamento =
      funcionario.dataAfastamento.getUTCFullYear() * 12 + funcionario.dataAfastamento.getUTCMonth();
    if (anoMesAfastamento > anoMesCompetencia) return "ativo";
  }

  return funcionario.status;
}

export type ResultadoVR = {
  elegivel: boolean;
  motivo: string | null;
  baseCalculo: number | null;
  valor: number;
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// O ERP manda motivos abreviados e sem acento ("LIC NAO REMUNERADA"), então em vez de comparar
// com uma lista fixa de textos exatos, checamos os dois radicais que importam pra regra.
export function ehLicencaSemRemuneracao(motivo: string | null | undefined): boolean {
  if (!motivo) return false;
  const m = normalizar(motivo);
  return m.includes("REMUNERA") && (m.includes("SEM") || m.includes("NAO"));
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function anoMesDe(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

// Dias trabalhados a partir de uma data de admissão dentro do mês da competência (inclusive).
function diasTrabalhadosDesde(data: Date, ano: number, mes: number): number {
  return diasNoMes(ano, mes) - data.getUTCDate() + 1;
}

// Um período "toca" a competência se ele começou até o fim deste mês e (ainda está aberto ou)
// só terminou depois do início deste mês.
function periodoTocaCompetencia(periodo: PeriodoAfastamento, competencia: { ano: number; mes: number }): boolean {
  const anoMesCompetencia = competencia.ano * 12 + (competencia.mes - 1);
  if (anoMesDe(periodo.inicio) > anoMesCompetencia) return false;
  if (periodo.fim && anoMesDe(periodo.fim) < anoMesCompetencia) return false;
  return true;
}

// Dias efetivos no mês: desconsidera dias antes da admissão (quando ela cai dentro do mês de
// competência), todo dia dentro de qualquer período de afastamento que toque o mês (pode haver
// mais de um ciclo no mesmo mês) e dias depois do desligamento (quando ele mantém VR por ter
// saído no fim do mês — o próprio dia do desligamento ainda conta como trabalhado). Faltas não
// entram nessa conta.
//
// Marca dia a dia (em vez de um intervalo [início,fim] por período) porque um afastamento que
// começa E termina dentro do mesmo mês deixa só aquela janela de fora — o resto do mês foi
// trabalhado normalmente.
function diasEfetivosNoMes(
  funcionario: {
    dataAdmissao: Date;
    dataDesligamento: Date | null;
    periodosAfastamento: PeriodoAfastamento[];
  },
  competencia: { ano: number; mes: number }
): number {
  const totalDias = diasNoMes(competencia.ano, competencia.mes);
  const trabalhou = new Array<boolean>(totalDias + 1).fill(true); // índices 1..totalDias

  const noMes = (d: Date) => d.getUTCFullYear() === competencia.ano && d.getUTCMonth() + 1 === competencia.mes;
  const anoMesCompetencia = competencia.ano * 12 + (competencia.mes - 1);

  function marcarFora(deInclusive: number, ateInclusive: number) {
    for (let d = Math.max(1, deInclusive); d <= Math.min(totalDias, ateInclusive); d++) trabalhou[d] = false;
  }

  if (noMes(funcionario.dataAdmissao)) {
    marcarFora(1, funcionario.dataAdmissao.getUTCDate() - 1);
  }

  for (const periodo of funcionario.periodosAfastamento) {
    if (!periodoTocaCompetencia(periodo, competencia)) continue;
    const inicioDia = anoMesDe(periodo.inicio) === anoMesCompetencia ? periodo.inicio.getUTCDate() : 1;
    const fimDia = periodo.fim && anoMesDe(periodo.fim) === anoMesCompetencia ? periodo.fim.getUTCDate() - 1 : totalDias;
    marcarFora(inicioDia, fimDia);
  }

  if (funcionario.dataDesligamento && noMes(funcionario.dataDesligamento)) {
    marcarFora(funcionario.dataDesligamento.getUTCDate() + 1, totalDias);
  }

  let dias = 0;
  for (let d = 1; d <= totalDias; d++) if (trabalhou[d]) dias++;
  return dias;
}

// Quando quem chama não tem o histórico completo de ciclos (ainda), reconstrói um período único
// a partir do par dataAfastamento/dataRetorno do cadastro — mantém o comportamento de antes pra
// quem só passa esses dois campos.
function periodosOuFallback(funcionario: {
  dataAfastamento: Date | null;
  dataRetorno?: Date | null;
  motivoAfastamento?: string | null;
  periodosAfastamento?: PeriodoAfastamento[];
}): PeriodoAfastamento[] {
  if (funcionario.periodosAfastamento) return funcionario.periodosAfastamento;
  if (!funcionario.dataAfastamento) return [];
  return [
    {
      inicio: funcionario.dataAfastamento,
      fim: funcionario.dataRetorno ?? null,
      motivo: funcionario.motivoAfastamento ?? null,
    },
  ];
}

export function calcularElegibilidadeCesta(funcionario: {
  status: string;
  dataAdmissao: Date;
  dataAfastamento: Date | null;
  dataRetorno?: Date | null;
  motivoAfastamento: string | null;
  periodosAfastamento?: PeriodoAfastamento[];
  faltasNoMes: number;
  recebeCestaBasicaResolvido: boolean;
}, competencia: { ano: number; mes: number }): ResultadoCesta {
  const admissaoAnoMes = anoMesDe(funcionario.dataAdmissao);
  const competenciaAnoMes = competencia.ano * 12 + (competencia.mes - 1);
  if (admissaoAnoMes > competenciaAnoMes) {
    return { elegivel: false, motivo: "Não admitido" };
  }

  if (!funcionario.recebeCestaBasicaResolvido) {
    return { elegivel: false, motivo: "Função sem cesta" };
  }

  if (funcionario.status === "desligado") {
    return { elegivel: false, motivo: "Desligado" };
  }

  // Considera o afastamento mesmo se o status já voltou pra "ativo" (retornou dentro do próprio
  // mês da competência) — senão a regra de licença sem remuneração nunca seria avaliada nesse
  // mês, já que o cadastro só guarda o status ATUAL.
  const afastamentoNestaCompetencia =
    funcionario.dataAfastamento !== null && anoMesDe(funcionario.dataAfastamento) === competenciaAnoMes;

  if ((funcionario.status === "afastado" || afastamentoNestaCompetencia) && funcionario.dataAfastamento) {
    const afastamento = funcionario.dataAfastamento;
    const mesesDesdeAfastamento = competenciaAnoMes - anoMesDe(afastamento);

    if (mesesDesdeAfastamento >= MESES_CESTA_APOS_AFASTAMENTO) {
      return { elegivel: false, motivo: `Afastado +${MESES_CESTA_APOS_AFASTAMENTO} meses` };
    }

    const periodos = periodosOuFallback(funcionario);
    // Licença sem remuneração: perde a cesta em qualquer competência (não só a do início do
    // afastamento) em que não completar os 28 dias trabalhados no mês, contando TODOS os ciclos
    // de afastamento que tocam o mês (pode ter mais de um, ex.: voltou e se afastou de novo).
    const temLicencaSemRemuneracaoNoMes = periodos.some(
      (p) => ehLicencaSemRemuneracao(p.motivo) && periodoTocaCompetencia(p, competencia)
    );
    if (temLicencaSemRemuneracaoNoMes) {
      const dias = diasEfetivosNoMes(
        { dataAdmissao: funcionario.dataAdmissao, dataDesligamento: null, periodosAfastamento: periodos },
        competencia
      );
      if (dias < DIAS_MINIMOS_NO_MES) {
        return {
          elegivel: false,
          motivo: `Licença s/ remun. <${DIAS_MINIMOS_NO_MES} dias`,
        };
      }
    }
    return { elegivel: true, motivo: null };
  }

  const admissao = funcionario.dataAdmissao;
  if (admissao.getUTCFullYear() === competencia.ano && admissao.getUTCMonth() + 1 === competencia.mes) {
    const dias = diasTrabalhadosDesde(admissao, competencia.ano, competencia.mes);
    if (dias < DIAS_MINIMOS_NO_MES) {
      return { elegivel: false, motivo: `Admissão <${DIAS_MINIMOS_NO_MES} dias no mês` };
    }
  }

  if (funcionario.faltasNoMes > 2) {
    return { elegivel: false, motivo: "Faltas" };
  }

  return { elegivel: true, motivo: null };
}

// A partir de que dia do mês um desligamento ainda mantém o VR daquele mês (proporcional),
// em vez de zerar — regra da empresa: quem sai perto do fim do mês já teve o arquivo de VR
// fechado, então o benefício é mantido em vez de estornado nas verbas rescisórias.
const DIA_MINIMO_DESLIGAMENTO_MANTEM_VR = 25;

export function calcularVR(
  funcionario: {
    status: string;
    salario: number;
    temGratificacao: boolean;
    valorValeRefeicao: number | null;
    recebeValeRefeicaoResolvido: boolean;
    dataAdmissao: Date;
    dataAfastamento: Date | null;
    dataRetorno: Date | null;
    dataDesligamento: Date | null;
    periodosAfastamento?: PeriodoAfastamento[];
  },
  competencia: { ano: number; mes: number }
): ResultadoVR {
  const admissaoAnoMes = anoMesDe(funcionario.dataAdmissao);
  const competenciaAnoMes = competencia.ano * 12 + (competencia.mes - 1);
  if (admissaoAnoMes > competenciaAnoMes) {
    return { elegivel: false, motivo: "Não admitido", baseCalculo: null, valor: 0 };
  }

  if (!funcionario.recebeValeRefeicaoResolvido) {
    return { elegivel: false, motivo: "Função sem alimentação", baseCalculo: null, valor: 0 };
  }
  if (funcionario.status === "desligado") {
    const desligamento = funcionario.dataDesligamento;
    const mantemPorDesligamentoNoFimDoMes =
      desligamento !== null &&
      desligamento.getUTCFullYear() === competencia.ano &&
      desligamento.getUTCMonth() + 1 === competencia.mes &&
      desligamento.getUTCDate() >= DIA_MINIMO_DESLIGAMENTO_MANTEM_VR;

    if (!mantemPorDesligamentoNoFimDoMes) {
      return { elegivel: false, motivo: "Desligado", baseCalculo: null, valor: 0 };
    }
  }

  const totalDias = diasNoMes(competencia.ano, competencia.mes);
  const periodos = periodosOuFallback(funcionario);
  const diasEfetivos = diasEfetivosNoMes(
    { dataAdmissao: funcionario.dataAdmissao, dataDesligamento: funcionario.dataDesligamento, periodosAfastamento: periodos },
    competencia
  );
  const proporcao = diasEfetivos / totalDias;
  const motivoProporcional = diasEfetivos < totalDias ? `Proporcional a ${diasEfetivos}/${totalDias} dias` : null;

  if (funcionario.valorValeRefeicao !== null) {
    return { elegivel: true, motivo: motivoProporcional, baseCalculo: null, valor: funcionario.valorValeRefeicao * proporcao };
  }

  // Piso de VR_MINIMO e teto de VR_MAXIMO valem pra todo mundo, com ou sem gratificação — a
  // gratificação só soma 40% ao salário ANTES de aplicar o percentual, não muda o piso/teto.
  const base = funcionario.temGratificacao ? funcionario.salario * (1 + GRATIFICACAO_PERCENTUAL) : funcionario.salario;
  const bruto = base * VR_PERCENTUAL;
  const valorIntegral = Math.min(Math.max(bruto, VR_MINIMO), VR_MAXIMO);
  const valor = valorIntegral * proporcao;
  return { elegivel: true, motivo: motivoProporcional, baseCalculo: base, valor };
}

export function calcularValorCestaConvertida(params: {
  elegivelCesta: boolean;
  recebeCestaComoVR: boolean;
  valorCestaBasicaEmpresa: number | null;
}): number | null {
  if (!params.elegivelCesta || !params.recebeCestaComoVR || params.valorCestaBasicaEmpresa === null) return null;
  return params.valorCestaBasicaEmpresa;
}

export function resolverHeranca(override: boolean | null, padraoCargo: boolean): boolean {
  return override ?? padraoCargo;
}

// --- Vale Gás ------------------------------------------------------------------------------
//
// Benefício com período aquisitivo próprio (~60 dias), entregue só em mês par. O período
// aquisitivo de uma entrega vai do dia 15 do mês (entrega - 3) até o dia 14 do mês (entrega - 1)
// — ex.: entrega em 08/2026 ⇒ período de 15/05/2026 a 14/07/2026. Diferente da cesta básica
// mensal: aqui não existe proporcionalidade — ou o colaborador cumpriu o período aquisitivo
// inteiro (sem faltar mais de 2 vezes nem se afastar nenhum dia), ou perde o benefício inteiro.

const FALTAS_MAXIMAS_VALE_GAS = 2;

export type PeriodoAquisitivoValeGas = { inicio: Date; fim: Date };

export function valeGasEhMesDeEntrega(mes: number): boolean {
  return mes % 2 === 0;
}

export function periodoAquisitivoValeGas(competenciaEntrega: { ano: number; mes: number }): PeriodoAquisitivoValeGas {
  if (!valeGasEhMesDeEntrega(competenciaEntrega.mes)) {
    throw new Error("Vale Gás só é apurado em meses pares (fevereiro, abril, junho, agosto, outubro, dezembro).");
  }
  let inicioMes = competenciaEntrega.mes - 3;
  let inicioAno = competenciaEntrega.ano;
  if (inicioMes <= 0) {
    inicioMes += 12;
    inicioAno -= 1;
  }
  const fimMes = competenciaEntrega.mes - 1; // nunca <= 0, já que o mês de entrega mínimo é 2
  return {
    inicio: new Date(Date.UTC(inicioAno, inicioMes - 1, 15)),
    fim: new Date(Date.UTC(competenciaEntrega.ano, fimMes - 1, 14)),
  };
}

export type ResultadoValeGas = { elegivel: boolean; motivo: string | null };

// Quem é desligado até o dia 10 do mês de entrega, mas só DEPOIS de completar o período
// aquisitivo inteiro, já recebeu o vale gás embutido no VR rescisório — não pode ser duplicado
// aqui. Quem é desligado ANTES de completar o período aquisitivo nunca chegou a ter direito,
// então continua caindo no motivo genérico de "desligado antes do fim do período" (não é
// rescisório, é só não ter cumprido o período).
const DIA_LIMITE_DESLIGAMENTO_RESCISORIO = 10;

export function calcularElegibilidadeValeGas(
  funcionario: {
    dataAdmissao: Date;
    dataDesligamento: Date | null;
    periodosAfastamento: PeriodoAfastamento[];
    faltasNoPeriodo: number;
    recebeValeGasResolvido: boolean;
    // Recebe o valor da entrega em dinheiro em vez da quantidade de vale — quem converteu não
    // entra na contagem de quantidade (mesmo cumprindo o período aquisitivo), já que o
    // pagamento é feito à parte, em pecúnia.
    pecunia?: boolean;
  },
  periodo: PeriodoAquisitivoValeGas,
  competenciaEntrega: { ano: number; mes: number }
): ResultadoValeGas {
  if (!funcionario.recebeValeGasResolvido) {
    return { elegivel: false, motivo: "Função sem vale gás" };
  }

  if (funcionario.dataAdmissao.getTime() > periodo.inicio.getTime()) {
    return { elegivel: false, motivo: "Admitido depois do início do período aquisitivo" };
  }

  // O próprio dia do desligamento ainda conta como trabalhado (mesma regra da cesta/VR) — só
  // desqualifica se ele saiu ANTES do período aquisitivo terminar.
  if (funcionario.dataDesligamento && funcionario.dataDesligamento.getTime() < periodo.fim.getTime()) {
    return { elegivel: false, motivo: "Desligado antes do fim do período aquisitivo" };
  }

  const limiteRescisorio = new Date(
    Date.UTC(competenciaEntrega.ano, competenciaEntrega.mes - 1, DIA_LIMITE_DESLIGAMENTO_RESCISORIO)
  );
  if (funcionario.dataDesligamento && funcionario.dataDesligamento.getTime() <= limiteRescisorio.getTime()) {
    return { elegivel: false, motivo: "Sem direito - Vale Gás rescisório" };
  }

  // Qualquer dia de afastamento dentro do período aquisitivo já desqualifica — sem
  // proporcionalidade aqui (diferente da cesta básica mensal). O dia do retorno não conta como
  // afastado (mesma regra de sempre), por isso o fim do período de afastamento é exclusivo.
  const UM_DIA_MS = 24 * 60 * 60 * 1000;
  const afastadoNoPeriodo = funcionario.periodosAfastamento.some((p) => {
    const ultimoDiaAfastado = p.fim ? p.fim.getTime() - UM_DIA_MS : Infinity;
    return p.inicio.getTime() <= periodo.fim.getTime() && ultimoDiaAfastado >= periodo.inicio.getTime();
  });
  if (afastadoNoPeriodo) {
    return { elegivel: false, motivo: "Afastado no período aquisitivo" };
  }

  if (funcionario.faltasNoPeriodo > FALTAS_MAXIMAS_VALE_GAS) {
    return { elegivel: false, motivo: `Mais de ${FALTAS_MAXIMAS_VALE_GAS} faltas no período` };
  }

  if (funcionario.pecunia) {
    return { elegivel: false, motivo: "Convertida em Pecúnia" };
  }

  return { elegivel: true, motivo: null };
}
