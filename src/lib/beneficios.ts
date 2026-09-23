// Motor de apuração de benefícios (cesta básica + vale-refeição). Funções puras — recebem os
// dados já carregados do banco e devolvem o resultado calculado; quem persiste é a camada de
// actions (src/app/admin/beneficios).

const VR_PERCENTUAL = 0.08;
const VR_MINIMO = 225;
const VR_MAXIMO = 520;
const GRATIFICACAO_PERCENTUAL = 0.4;
const DIAS_MINIMOS_NO_MES = 28;
const MESES_CESTA_APOS_AFASTAMENTO = 3;

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

// Dias trabalhados a partir de uma data de admissão dentro do mês da competência (inclusive).
function diasTrabalhadosDesde(data: Date, ano: number, mes: number): number {
  return diasNoMes(ano, mes) - data.getUTCDate() + 1;
}

// Dias trabalhados até a véspera de uma data de afastamento dentro do mês da competência.
function diasTrabalhadosAte(data: Date): number {
  return data.getUTCDate() - 1;
}

export function calcularElegibilidadeCesta(funcionario: {
  status: string;
  dataAdmissao: Date;
  dataAfastamento: Date | null;
  dataRetorno?: Date | null;
  motivoAfastamento: string | null;
  faltasNoMes: number;
  recebeCestaBasicaResolvido: boolean;
}, competencia: { ano: number; mes: number }): ResultadoCesta {
  const admissaoAnoMes = funcionario.dataAdmissao.getUTCFullYear() * 12 + funcionario.dataAdmissao.getUTCMonth();
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
    funcionario.dataAfastamento !== null &&
    funcionario.dataAfastamento.getUTCFullYear() === competencia.ano &&
    funcionario.dataAfastamento.getUTCMonth() + 1 === competencia.mes;

  if ((funcionario.status === "afastado" || afastamentoNestaCompetencia) && funcionario.dataAfastamento) {
    const afastamento = funcionario.dataAfastamento;
    const mesesDesdeAfastamento =
      competencia.ano * 12 + competencia.mes - (afastamento.getUTCFullYear() * 12 + (afastamento.getUTCMonth() + 1));

    if (mesesDesdeAfastamento >= MESES_CESTA_APOS_AFASTAMENTO) {
      return { elegivel: false, motivo: `Afastado +${MESES_CESTA_APOS_AFASTAMENTO} meses` };
    }
    // Licença sem remuneração: perde a cesta em qualquer competência (não só a do início do
    // afastamento) em que não completar os 28 dias trabalhados — no mês em que a licença começa
    // conta os dias antes do afastamento (e depois do retorno, se ele também caiu nesse mesmo
    // mês); nos meses seguintes, ainda dentro da licença sem ter retornado, é 0 dia trabalhado o
    // mês inteiro.
    if (ehLicencaSemRemuneracao(funcionario.motivoAfastamento)) {
      let dias = mesesDesdeAfastamento === 0 ? diasTrabalhadosAte(afastamento) : 0;
      const retorno = funcionario.dataRetorno ?? null;
      if (
        retorno &&
        retorno.getUTCFullYear() === competencia.ano &&
        retorno.getUTCMonth() + 1 === competencia.mes
      ) {
        dias += diasTrabalhadosDesde(retorno, competencia.ano, competencia.mes);
      }
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

// Dias efetivos no mês para fins de VR: desconsidera dias antes da admissão (quando ela cai
// dentro do mês de competência), dias de afastamento, dias de retorno e dias depois do
// desligamento (quando ele mantém VR por ter saído no fim do mês — o próprio dia do
// desligamento ainda conta como trabalhado). Faltas não entram nessa conta.
//
// Marca dia a dia (em vez de um único intervalo [início,fim]) porque um afastamento que começa
// E termina dentro do mesmo mês (ex.: afastou dia 17, voltou dia 23) deixa só essa janela de
// fora — o resto do mês foi trabalhado normalmente. Um intervalo único não representa isso: só
// dá pra cortar do início OU do fim, não abrir um buraco no meio.
function diasEfetivosNoMes(
  funcionario: {
    dataAdmissao: Date;
    status: string;
    dataAfastamento: Date | null;
    dataRetorno: Date | null;
    dataDesligamento: Date | null;
  },
  competencia: { ano: number; mes: number }
): number {
  const totalDias = diasNoMes(competencia.ano, competencia.mes);
  const trabalhou = new Array<boolean>(totalDias + 1).fill(true); // índices 1..totalDias

  const noMes = (d: Date) => d.getUTCFullYear() === competencia.ano && d.getUTCMonth() + 1 === competencia.mes;
  const anoMes = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  const anoMesCompetencia = competencia.ano * 12 + (competencia.mes - 1);

  function marcarFora(deInclusive: number, ateInclusive: number) {
    for (let d = Math.max(1, deInclusive); d <= Math.min(totalDias, ateInclusive); d++) trabalhou[d] = false;
  }

  if (noMes(funcionario.dataAdmissao)) {
    marcarFora(1, funcionario.dataAdmissao.getUTCDate() - 1);
  }

  if (funcionario.status === "desligado" && funcionario.dataDesligamento && noMes(funcionario.dataDesligamento)) {
    const desligamento = funcionario.dataDesligamento;
    marcarFora(desligamento.getUTCDate() + 1, totalDias);
    // Desligado direto de um afastamento que nunca teve retorno (ex.: saiu de licença médica e
    // foi desligado sem voltar a trabalhar) — os dias de afastamento também não foram
    // trabalhados, não só os de depois do desligamento.
    if (funcionario.dataAfastamento) {
      if (anoMes(funcionario.dataAfastamento) < anoMesCompetencia) {
        marcarFora(1, desligamento.getUTCDate());
      } else if (noMes(funcionario.dataAfastamento)) {
        marcarFora(funcionario.dataAfastamento.getUTCDate(), desligamento.getUTCDate());
      }
    }
  } else if (funcionario.status === "afastado" && funcionario.dataAfastamento) {
    if (anoMes(funcionario.dataAfastamento) < anoMesCompetencia) {
      marcarFora(1, totalDias);
    } else if (noMes(funcionario.dataAfastamento)) {
      marcarFora(funcionario.dataAfastamento.getUTCDate(), totalDias);
    }
  } else if (funcionario.dataRetorno && noMes(funcionario.dataRetorno)) {
    // Se o próprio afastamento que gerou esse retorno também caiu neste mês, só a janela entre
    // as duas datas fica de fora; senão (o afastamento já vinha de um mês anterior), o mês
    // inteiro até a véspera do retorno é que fica de fora.
    const inicioAfastamento =
      funcionario.dataAfastamento && noMes(funcionario.dataAfastamento)
        ? funcionario.dataAfastamento.getUTCDate()
        : 1;
    marcarFora(inicioAfastamento, funcionario.dataRetorno.getUTCDate() - 1);
  }

  let dias = 0;
  for (let d = 1; d <= totalDias; d++) if (trabalhou[d]) dias++;
  return dias;
}

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
  },
  competencia: { ano: number; mes: number }
): ResultadoVR {
  const admissaoAnoMes = funcionario.dataAdmissao.getUTCFullYear() * 12 + funcionario.dataAdmissao.getUTCMonth();
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
  const diasEfetivos = diasEfetivosNoMes(funcionario, competencia);
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
