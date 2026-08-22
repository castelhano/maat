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
  motivoAfastamento: string | null;
  faltasNoMes: number;
  recebeCestaBasicaResolvido: boolean;
}, competencia: { ano: number; mes: number }): ResultadoCesta {
  if (!funcionario.recebeCestaBasicaResolvido) {
    return { elegivel: false, motivo: "Função sem direito a cesta básica" };
  }

  if (funcionario.status === "desligado") {
    return { elegivel: false, motivo: "Desligado" };
  }

  if (funcionario.status === "afastado" && funcionario.dataAfastamento) {
    const afastamento = funcionario.dataAfastamento;
    const mesesDesdeAfastamento =
      competencia.ano * 12 + competencia.mes - (afastamento.getUTCFullYear() * 12 + (afastamento.getUTCMonth() + 1));

    if (mesesDesdeAfastamento >= MESES_CESTA_APOS_AFASTAMENTO) {
      return { elegivel: false, motivo: `Afastado há mais de ${MESES_CESTA_APOS_AFASTAMENTO} meses` };
    }
    if (mesesDesdeAfastamento === 0 && ehLicencaSemRemuneracao(funcionario.motivoAfastamento)) {
      const dias = diasTrabalhadosAte(afastamento);
      if (dias < DIAS_MINIMOS_NO_MES) {
        return {
          elegivel: false,
          motivo: `Licença sem remuneração com menos de ${DIAS_MINIMOS_NO_MES} dias trabalhados no mês`,
        };
      }
    }
    return { elegivel: true, motivo: null };
  }

  const admissao = funcionario.dataAdmissao;
  if (admissao.getUTCFullYear() === competencia.ano && admissao.getUTCMonth() + 1 === competencia.mes) {
    const dias = diasTrabalhadosDesde(admissao, competencia.ano, competencia.mes);
    if (dias < DIAS_MINIMOS_NO_MES) {
      return { elegivel: false, motivo: `Menos de ${DIAS_MINIMOS_NO_MES} dias trabalhados no mês de admissão` };
    }
  }

  if (funcionario.faltasNoMes > 2) {
    return { elegivel: false, motivo: `Mais de 2 faltas no mês (${funcionario.faltasNoMes})` };
  }

  return { elegivel: true, motivo: null };
}

// Dias efetivos no mês para fins de VR: desconsidera dias antes da admissão (quando ela cai
// dentro do mês de competência), dias de afastamento (parcial, quando o afastamento começou
// dentro do mês; ou o mês inteiro, quando o afastamento já vinha de meses anteriores) e dias
// antes do retorno (quando o colaborador voltou de um afastamento dentro do próprio mês da
// competência — dataRetorno continua marcada mesmo já com status "ativo", só pra isso). Faltas
// não entram nessa conta — só afastamento, retorno e admissão afetam o VR.
function diasEfetivosNoMes(
  funcionario: { dataAdmissao: Date; status: string; dataAfastamento: Date | null; dataRetorno: Date | null },
  competencia: { ano: number; mes: number }
): number {
  const totalDias = diasNoMes(competencia.ano, competencia.mes);
  let inicio = 1;
  let fim = totalDias;

  const admissao = funcionario.dataAdmissao;
  if (admissao.getUTCFullYear() === competencia.ano && admissao.getUTCMonth() + 1 === competencia.mes) {
    inicio = admissao.getUTCDate();
  }

  if (funcionario.status === "afastado" && funcionario.dataAfastamento) {
    const afastamento = funcionario.dataAfastamento;
    const afastamentoAnoMes = afastamento.getUTCFullYear() * 12 + afastamento.getUTCMonth();
    const competenciaAnoMes = competencia.ano * 12 + (competencia.mes - 1);

    if (afastamentoAnoMes < competenciaAnoMes) {
      fim = 0;
    } else if (afastamentoAnoMes === competenciaAnoMes) {
      fim = Math.min(fim, afastamento.getUTCDate() - 1);
    }
  } else if (funcionario.dataRetorno) {
    const retorno = funcionario.dataRetorno;
    if (retorno.getUTCFullYear() === competencia.ano && retorno.getUTCMonth() + 1 === competencia.mes) {
      inicio = Math.max(inicio, retorno.getUTCDate());
    }
  }

  return Math.max(0, fim - inicio + 1);
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
  },
  competencia: { ano: number; mes: number }
): ResultadoVR {
  if (!funcionario.recebeValeRefeicaoResolvido) {
    return { elegivel: false, motivo: "Função sem direito a vale-refeição", baseCalculo: null, valor: 0 };
  }
  if (funcionario.status === "desligado") {
    return { elegivel: false, motivo: "Desligado", baseCalculo: null, valor: 0 };
  }

  const totalDias = diasNoMes(competencia.ano, competencia.mes);
  const diasEfetivos = diasEfetivosNoMes(funcionario, competencia);
  const proporcao = diasEfetivos / totalDias;
  const motivoProporcional =
    diasEfetivos < totalDias
      ? `Proporcional a ${diasEfetivos}/${totalDias} dias (desconsiderado afastamento/retorno/admissão no mês)`
      : null;

  if (funcionario.valorValeRefeicao !== null) {
    return { elegivel: true, motivo: motivoProporcional, baseCalculo: null, valor: funcionario.valorValeRefeicao * proporcao };
  }

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
