// Motor de conferência da folha: refaz as contas a partir dos eventos de cada funcionário e
// compara com o que veio do ERP. Não depende de banco — recebe os dados já lidos do relatório.

import type { EventoFolha, FuncionarioFolha } from "../parsers/folha-pagamento";
import { feriadosNacionais } from "../feriados";
import { parametrosDoAno, type ParametrosFolha } from "./parametros";

export type StatusCritica = "ok" | "erro" | "alerta" | "pendente" | "info";

export type Critica = {
  regra: string;
  titulo: string;
  status: StatusCritica;
  esperado?: number;
  encontrado?: number;
  detalhe: string;
};

export type Categoria = "normal" | "ferias" | "rescisao" | "afastado";

export type ResultadoFuncionario = {
  matricula: string;
  nome: string;
  funcao: string;
  situacao: string;
  categoria: Categoria;
  salarioBase: number;
  proventos: number;
  descontos: number;
  liquido: number;
  fgts: number;
  inss: number;
  ir: number;
  consignado: number;
  divisorHoras: number | null;
  criticas: Critica[];
  // Pior status entre as críticas (erro > alerta > pendente > ok).
  status: Exclude<StatusCritica, "info">;
};

export type CalendarioCompetencia = { dias: number; diasUteis: number; diasDsr: number };

const TOLERANCIA = 0.02;

// Eventos pagos no recibo de férias (férias, 1/3, médias, gratificação e abono pecuniário).
const CODIGOS_FERIAS = [
  "00007", "00021", "00084", "00085", "00146", "00147",
  "00213", "00214", "00215", "00216", "00353", "00354", "00358", "00359", "00360",
];
// Eventos de férias que compõem a base de INSS das férias (o abono pecuniário não tem INSS).
const CODIGOS_BASE_INSS_FERIAS = ["00007", "00021", "00084", "00085", "00146", "00147", "00358"];
const CODIGOS_RESCISAO = ["00188", "00483", "00009", "00014", "00024", "00166", "00212", "00349", "00433", "00434"];

function arred(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function fmt(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function calendarioCompetencia(competencia: string): CalendarioCompetencia {
  const [mes, ano] = competencia.split("/").map(Number);
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const feriados = new Set(feriadosNacionais(ano).map((d) => d.getTime()));
  let diasDsr = 0;
  for (let dia = 1; dia <= dias; dia++) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (data.getUTCDay() === 0 || feriados.has(data.getTime())) diasDsr++;
  }
  return { dias, diasUteis: dias - diasDsr, diasDsr };
}

export function calcularInss(base: number, p: ParametrosFolha): number {
  let total = 0;
  let anterior = 0;
  for (const faixa of p.inss) {
    if (base <= anterior) break;
    total += (Math.min(base, faixa.ate) - anterior) * faixa.aliquota;
    anterior = faixa.ate;
  }
  return arred(total);
}

export function calcularIr(baseIr: number, rendimentoBruto: number, p: ParametrosFolha): number {
  const faixa = p.ir.find((f) => baseIr <= f.ate) ?? p.ir[p.ir.length - 1];
  let imposto = Math.max(0, baseIr * faixa.aliquota - faixa.deducao);
  if (p.irRedutor) {
    if (rendimentoBruto <= p.irRedutor.ate) imposto = 0;
    else if (rendimentoBruto <= p.irRedutor.ateParcial) {
      imposto = Math.max(0, imposto - (p.irRedutor.valorFixo - p.irRedutor.fator * rendimentoBruto));
    }
  }
  imposto = arred(imposto);
  return imposto < p.irMinimoRetencao ? 0 : imposto;
}

function diasNaCompetencia(inicio: string, fim: string, competencia: string): number {
  const [mes, ano] = competencia.split("/").map(Number);
  const paraData = (s: string) => {
    const [d, m, a] = s.split("/").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  const ini = Math.max(paraData(inicio), Date.UTC(ano, mes - 1, 1));
  const fimMes = Date.UTC(ano, mes, 0);
  const fi = Math.min(paraData(fim), fimMes);
  if (fi < ini) return 0;
  return Math.round((fi - ini) / 86_400_000) + 1;
}

export function conferirFuncionario(
  f: FuncionarioFolha,
  competencia: string,
  calendario: CalendarioCompetencia,
  p: ParametrosFolha,
  salarioMotorista: number = p.salarioMotoristaPadrao
): ResultadoFuncionario {
  const criticas: Critica[] = [];
  const ev = (codigo: string): EventoFolha | undefined => f.eventos.find((e) => e.codigo === codigo);
  const val = (codigo: string) => ev(codigo)?.valor ?? 0;
  const tem = (codigo: string) => ev(codigo) !== undefined;
  const soma = (codigos: string[]) => codigos.reduce((acc, c) => acc + val(c), 0);

  // `pendenteSeDivergir`: quando a divergência tem explicação conhecida que só o histórico
  // resolve, a crítica vira "pendente" em vez de "erro".
  function comparar(
    regra: string,
    titulo: string,
    esperado: number,
    encontrado: number,
    explicacao: string,
    tolerancia = TOLERANCIA,
    pendenteSeDivergir?: string
  ) {
    const diferenca = arred(encontrado - esperado);
    const ok = Math.abs(diferenca) <= tolerancia;
    if (!ok && pendenteSeDivergir) {
      criticas.push({
        regra,
        titulo,
        status: "pendente",
        esperado: arred(esperado),
        encontrado: arred(encontrado),
        detalhe: `${explicacao} Diferença de ${fmt(diferenca)} — ${pendenteSeDivergir}`,
      });
      return;
    }
    criticas.push({
      regra,
      titulo,
      status: ok ? "ok" : "erro",
      esperado: arred(esperado),
      encontrado: arred(encontrado),
      detalhe: ok ? explicacao : `${explicacao} Diferença de ${fmt(diferenca)}.`,
    });
  }
  function pendente(regra: string, titulo: string, detalhe: string) {
    criticas.push({ regra, titulo, status: "pendente", detalhe });
  }
  function info(regra: string, titulo: string, detalhe: string) {
    criticas.push({ regra, titulo, status: "info", detalhe });
  }

  const aprendiz = /APRENDIZ/i.test(f.funcao);
  const rescisao = /^Desligado/i.test(f.situacao) || CODIGOS_RESCISAO.some(tem);
  const ferias = !rescisao && (f.gozoInicio !== null || CODIGOS_FERIAS.some(tem));
  const afastado = /^Afastado/i.test(f.situacao);
  const categoria: Categoria = rescisao ? "rescisao" : ferias ? "ferias" : afastado ? "afastado" : "normal";

  const proventos = f.eventos.filter((e) => e.coluna === "provento").reduce((a, e) => a + e.valor, 0);
  const descontos = f.eventos.filter((e) => e.coluna === "desconto").reduce((a, e) => a + e.valor, 0);
  const consignadoEventos = f.eventos.filter((e) => e.coluna === "desconto" && /^020\d\d$/.test(e.codigo));
  const consignado = consignadoEventos.reduce((a, e) => a + e.valor, 0);
  const inssTotal = val("00451") + val("00500");
  const irTotal = val("00453") + val("00481");
  const salarioDia = f.salarioBase / 30;
  // Reajuste (dissídio) no mês: férias pagas antes do reajuste saem com o salário antigo e a
  // diferença vem em evento próprio — sem o recibo original não dá para conferir o valor.
  const dissidio = tem("00413") || tem("00013");
  const motivoDissidio = dissidio
    ? "houve reajuste salarial no mês e as férias foram calculadas com o salário anterior (diferença paga à parte); precisa do histórico."
    : undefined;

  // --- Totais do recibo ---------------------------------------------------------------------
  if (tem("00107")) comparar("totais", "Total de proventos", proventos, val("00107"), "Soma dos proventos do recibo.");
  if (tem("00106")) comparar("totais", "Total de descontos", descontos, val("00106"), "Soma dos descontos do recibo.");
  const codigoLiquido = tem("00483") ? "00483" : tem("00996") ? "00996" : null;
  if (codigoLiquido && tem("00107")) {
    comparar("totais", "Líquido", val("00107") - val("00106"), val(codigoLiquido), "Total de proventos − total de descontos.");
  }

  if (proventos === 0 && descontos === 0) {
    info("sem_calculo", "Sem cálculo no mês", afastado ? "Funcionário afastado, sem verbas no mês." : "Nenhum provento ou desconto no mês.");
  }

  // --- Salário (dias trabalhados) -----------------------------------------------------------
  for (const [codigo, titulo] of [
    ["00001", "Salário normal"],
    ["00752", "Atestado médico"],
    ["00188", "Saldo de salário"],
  ] as const) {
    const e = ev(codigo);
    if (e && e.referencia !== null) {
      comparar("salario", titulo, salarioDia * e.referencia, e.valor, `Salário ${fmt(f.salarioBase)} ÷ 30 × ${e.referencia} dia(s).`);
    }
  }

  // --- Horas: hora extra, treinamento e adicional noturno ----------------------------------
  // Valor da hora = (salário + adicional de insalubridade/periculosidade) ÷ divisor. O divisor
  // depende da jornada (220 = 44h semanais, 180 = escalas 12x36, 100 = aprendiz meio período);
  // para as funções de 42h semanais (motorista, promotor de venda) é fixo em 210.
  const adicional = tem("01000") ? val("01000") : val("00005") + val("00006");
  const eventosHora = [
    { codigo: "00003", titulo: "Hora extra 50%", fator: 1.5 },
    { codigo: "00363", titulo: "Hora extra 100%", fator: 2 },
    { codigo: "00545", titulo: "Horas de treinamento", fator: 1.5 },
    { codigo: "00004", titulo: "Adicional noturno", fator: p.adicionalNoturno },
  ]
    .map((d) => ({ ...d, evento: ev(d.codigo) }))
    .filter((d) => d.evento && d.evento.referencia);

  const toleranciaHora = (divisor: number, fator: number) =>
    // As horas vêm arredondadas em 2 casas no relatório; aceita esse arredondamento.
    Math.max(TOLERANCIA, ((f.salarioBase + adicional) / divisor) * fator * 0.005 + 0.01);
  const confere = (divisor: number) =>
    eventosHora.every((d) => {
      const esperado = ((f.salarioBase + adicional) / divisor) * d.fator * (d.evento!.referencia ?? 0);
      return Math.abs(esperado - d.evento!.valor) <= toleranciaHora(divisor, d.fator);
    });

  const divisorFixo = p.jornada42h.funcoes.includes(f.funcao.trim().toUpperCase()) ? p.jornada42h.divisor : null;
  let divisorHoras: number | null = null;
  if (eventosHora.length > 0) {
    divisorHoras = divisorFixo ?? p.divisoresHora.find(confere) ?? p.divisoresHora[0];
    const hora = (f.salarioBase + adicional) / divisorHoras;
    for (const d of eventosHora) {
      const horas = d.evento!.referencia ?? 0;
      const explicacao =
        `(${fmt(f.salarioBase)}${adicional ? ` + adicional ${fmt(adicional)}` : ""}) ÷ ${divisorHoras} = ${fmt(hora)}/h` +
        ` × ${d.codigo === "00004" ? "20%" : d.fator === 2 ? "2" : "1,5"} × ${fmt(horas)} h.`;
      comparar(d.codigo === "00004" ? "adicional_noturno" : "horas_extras", d.titulo, hora * d.fator * horas, d.evento!.valor, explicacao, toleranciaHora(divisorHoras, d.fator));
    }
    if (divisorFixo) {
      info("divisor", "Divisor de horas", `${f.funcao.trim()}: hora calculada com divisor ${divisorHoras} (jornada de 42h semanais).`);
    } else if (divisorHoras !== p.divisoresHora[0]) {
      info("divisor", "Divisor de horas", `Hora calculada com divisor ${divisorHoras} (jornada diferente de ${p.divisoresHora[0]}h).`);
    }
  }

  // --- DSR sobre horas extras e sobre adicional noturno ------------------------------------
  const dsrPerdidos = ev("00509")?.referencia ?? 0;
  const fatorDsr = (calendario.diasDsr - dsrPerdidos) / calendario.diasUteis;
  const textoFator = `${calendario.diasDsr - dsrPerdidos} dia(s) de descanso ÷ ${calendario.diasUteis} dias úteis`;
  // Na rescisão o DSR é proporcional aos dias trabalhados até o desligamento.
  const motivoDsrRescisao = rescisao ? "na rescisão o DSR é proporcional ao período trabalhado; será conferido com o histórico." : undefined;
  if (tem("00126")) {
    const baseHe = val("00003") + val("00363");
    comparar("dsr", "DSR sobre horas extras", baseHe * fatorDsr, val("00126"), `(HE 50% + HE 100%) ${fmt(baseHe)} × ${textoFator}.`, TOLERANCIA, motivoDsrRescisao);
  }
  const dsrNoturno = ev("00119");
  const noturno = ev("00004");
  if (dsrNoturno && noturno?.referencia) {
    const divisor = divisorHoras ?? divisorFixo ?? p.divisoresHora[0];
    const horasDsr = noturno.referencia * fatorDsr;
    // O ERP calcula o DSR do noturno sobre a hora sem o adicional de insalubridade/periculosidade.
    const esperado = horasDsr * (f.salarioBase / divisor) * p.adicionalNoturno;
    comparar(
      "dsr",
      "DSR sobre adicional noturno",
      esperado,
      dsrNoturno.valor,
      `${fmt(noturno.referencia)} h noturnas × ${textoFator} = ${fmt(horasDsr)} h × (${fmt(f.salarioBase)} ÷ ${divisor}) × 20%.`,
      Math.max(TOLERANCIA, (f.salarioBase / divisor) * p.adicionalNoturno * 0.005 + 0.01),
      motivoDsrRescisao
    );
  }

  // --- INSS ---------------------------------------------------------------------------------
  if (tem("00451") || tem("00500")) {
    const base = val("00096") + val("00981");
    // Quando o INSS das férias passou do devido, o excesso volta como provento (00713).
    const devolvido = val("00713");
    comparar(
      "inss",
      "INSS",
      calcularInss(base, p),
      inssTotal - devolvido,
      `Tabela progressiva sobre ${fmt(base)}${tem("00981") ? " (salário + férias)" : ""}${tem("00500") ? `; somado INSS do salário ${fmt(val("00451"))} + INSS das férias ${fmt(val("00500"))}` : ""}${devolvido ? ` − INSS devolvido ${fmt(devolvido)}` : ""}.`
    );
  }
  if (tem("00452")) {
    comparar("inss", "INSS 13º salário", calcularInss(val("00094"), p), val("00452"), `Tabela progressiva sobre ${fmt(val("00094"))}.`);
  }

  // --- IR -----------------------------------------------------------------------------------
  if (rescisao) {
    if (tem("00453") || tem("00101")) pendente("ir", "IR da rescisão", "Conferência do IR da rescisão será liberada junto com o histórico e os motivos de desligamento.");
  } else if (tem("00096") && tem("00101")) {
    const bruto = val("00096");
    const dependentes = val("00800");
    const pensao = val("00469");
    const baseCompleta = bruto - val("00451") - dependentes - pensao;
    const baseSimplificada = bruto - p.irDescontoSimplificado;
    if (tem("15501")) {
      comparar(
        "ir_base",
        "Base IR com deduções legais",
        baseCompleta,
        val("15501"),
        `Bruto ${fmt(bruto)} − INSS ${fmt(val("00451"))}${dependentes ? ` − dependentes ${fmt(dependentes)}` : ""}${pensao ? ` − pensão ${fmt(pensao)}` : ""}.`
      );
    }
    if (tem("15502")) {
      comparar("ir_base", "Base IR com desconto simplificado", baseSimplificada, val("15502"), `Bruto ${fmt(bruto)} − desconto simplificado ${fmt(p.irDescontoSimplificado)}.`);
    }
    const baseIr = Math.max(0, Math.min(baseCompleta, baseSimplificada));
    comparar("ir_base", "Base do IR", baseIr, val("00101"), "Usa a menor base entre deduções legais e desconto simplificado.");
    const esperado = calcularIr(val("00101"), bruto, p);
    let explicacao = `Tabela 2026 sobre a base ${fmt(val("00101"))}`;
    if (p.irRedutor && bruto <= p.irRedutor.ate) explicacao += `; rendimento ${fmt(bruto)} até ${fmt(p.irRedutor.ate)} é isento`;
    else if (p.irRedutor && bruto <= p.irRedutor.ateParcial) explicacao += `; com redução de ${fmt(p.irRedutor.valorFixo - p.irRedutor.fator * bruto)} (rendimento ${fmt(bruto)})`;
    comparar("ir", "IR", esperado, val("00453"), `${explicacao}.`);
  }
  if (tem("00481")) {
    pendente("ir_ferias", "IR das férias", "O IR das férias é calculado no recibo de férias (pode cobrir dois meses) — precisa do histórico para conferir.");
  }

  // --- FGTS ---------------------------------------------------------------------------------
  const aliquotaFgts = aprendiz ? p.fgtsAprendiz : p.fgts;
  const textoFgts = aprendiz ? "2% (aprendiz)" : "8%";
  if (tem("00993")) comparar("fgts", "FGTS", val("00914") * aliquotaFgts, val("00993"), `${textoFgts} sobre a base ${fmt(val("00914"))}.`);
  if (tem("00913")) comparar("fgts", "FGTS 13º", val("00915") * aliquotaFgts, val("00913"), `${textoFgts} sobre a base ${fmt(val("00915"))}.`);

  // --- Contribuições sindicais --------------------------------------------------------------
  if (tem("00492")) {
    comparar("contribuicoes", "Contribuição confederativa", f.salarioBase * p.contribuicaoConfederativa, val("00492"), `1% do salário base ${fmt(f.salarioBase)}.`);
  }
  if (tem("00493")) {
    const teto = arred(salarioMotorista * p.contribuicaoSocial);
    const calculado = f.salarioBase * p.contribuicaoSocial;
    comparar(
      "contribuicoes",
      "Contribuição social",
      Math.min(calculado, teto),
      val("00493"),
      calculado > teto
        ? `1,5% do salário base ${fmt(f.salarioBase)} = ${fmt(calculado)}, limitado ao teto de ${fmt(teto)} (1,5% do salário de motorista ${fmt(salarioMotorista)}).`
        : `1,5% do salário base ${fmt(f.salarioBase)} (abaixo do teto de ${fmt(teto)}).`
    );
  }

  // --- E-consignado -------------------------------------------------------------------------
  if (consignado > 0) {
    const disponivel = proventos - inssTotal - irTotal;
    const limite = arred(disponivel * p.limiteConsignado);
    const excesso = arred(consignado - limite);
    criticas.push({
      regra: "consignado",
      titulo: "Limite do e-consignado (35%)",
      status: excesso > TOLERANCIA ? "alerta" : "ok",
      esperado: limite,
      encontrado: arred(consignado),
      detalhe:
        `35% de (proventos ${fmt(proventos)} − INSS ${fmt(inssTotal)} − IR ${fmt(irTotal)}) = limite ${fmt(limite)}; ` +
        `descontado ${fmt(consignado)} em ${consignadoEventos.length} parcela(s).` +
        (excesso > TOLERANCIA ? ` Excede em ${fmt(excesso)}.` : ""),
    });
  }

  // --- Férias -------------------------------------------------------------------------------
  if (tem("00007")) {
    if (f.gozoInicio && f.gozoFim) {
      const dias = diasNaCompetencia(f.gozoInicio, f.gozoFim, competencia);
      comparar(
        "ferias",
        "Férias (dias no mês)",
        salarioDia * dias,
        val("00007"),
        `Salário ÷ 30 × ${dias} dia(s) de gozo no mês (${f.gozoInicio} a ${f.gozoFim}).`,
        TOLERANCIA,
        motivoDissidio
      );
    } else {
      pendente("ferias", "Férias (dias no mês)", "O relatório não trouxe o período de gozo para conferir os dias.");
    }
  }
  for (const [codigo, base, titulo] of [
    ["00021", "00007", "1/3 de férias"],
    ["00085", "00084", "1/3 sobre médias"],
    ["00214", "00213", "1/3 do abono"],
    ["00216", "00215", "1/3 da média do abono"],
    ["00147", "00146", "1/3 da gratificação de férias"],
    ["00354", "00353", "1/3 da gratificação do abono"],
    ["00433", "00009", "1/3 de férias indenizadas"],
  ] as const) {
    // O ERP soma o 1/3 de cada parcela separadamente, então aceita alguns centavos de arredondamento.
    if (tem(codigo) && tem(base)) comparar("ferias", titulo, val(base) / 3, val(codigo), `Um terço de ${fmt(val(base))}.`, 0.05);
  }
  if (tem("00213")) {
    const dias = val("00213") / salarioDia;
    const inteiro = Math.round(dias);
    if (inteiro >= 1 && inteiro <= 10) {
      comparar("ferias", "Abono pecuniário", salarioDia * inteiro, val("00213"), `Salário ÷ 30 × ${inteiro} dia(s) de abono.`, TOLERANCIA, motivoDissidio);
    } else if (motivoDissidio) {
      pendente("ferias", "Abono pecuniário", `Não corresponde a dias inteiros do salário atual — ${motivoDissidio}`);
    } else {
      criticas.push({
        regra: "ferias",
        titulo: "Abono pecuniário",
        status: "erro",
        encontrado: val("00213"),
        detalhe: `O valor equivale a ${fmt(dias)} dias de salário — o abono deve ser de 1 a 10 dias inteiros.`,
      });
    }
  }
  if (tem("00084") || tem("00215")) {
    pendente("ferias_medias", "Médias de férias", "Médias de horas extras/adicionais dos últimos 12 meses — precisa do histórico das folhas.");
  }
  if (tem("00358") || tem("00359") || tem("00360")) {
    pendente("ferias_medias", "Adicional de insalubridade nas férias", "Depende da base de insalubridade do período aquisitivo — precisa do histórico.");
  }
  if (tem("00981")) {
    comparar("ferias", "Base de INSS das férias", soma(CODIGOS_BASE_INSS_FERIAS), val("00981"), "Férias + 1/3 + médias (o abono pecuniário não entra).");
  }
  if (tem("00459")) {
    const bruto = soma(CODIGOS_FERIAS);
    // O adiantamento do 13º, quando pedido nas férias, vem no mesmo recibo.
    const adiantamento13 = val("00034");
    const devolucao = val("15577");
    // Pensão alimentícia sobre as férias também sai do recibo de férias.
    const pensaoFerias = val("00470");
    comparar(
      "ferias",
      "Férias pagas (adiantamento)",
      bruto + adiantamento13 - val("00500") - val("00481") - devolucao - pensaoFerias,
      val("00459"),
      `Férias brutas ${fmt(bruto)}${adiantamento13 ? ` + adiantamento do 13º ${fmt(adiantamento13)}` : ""} − INSS férias ${fmt(val("00500"))} − IR férias ${fmt(val("00481"))}${devolucao ? ` − e-consignado do recibo ${fmt(devolucao)}` : ""}${pensaoFerias ? ` − pensão alimentícia das férias ${fmt(pensaoFerias)}` : ""}.`
    );
  }

  // --- Rescisão -----------------------------------------------------------------------------
  if (tem("00024")) {
    const avos = val("00024") / (f.salarioBase / 12);
    const inteiro = Math.round(avos);
    if (inteiro >= 1 && inteiro <= 12 && Math.abs(avos - inteiro) < 0.01) {
      comparar("rescisao", "13º proporcional", (f.salarioBase / 12) * inteiro, val("00024"), `Salário ÷ 12 × ${inteiro} avo(s). A quantidade de avos será conferida com o histórico.`);
    } else {
      pendente(
        "rescisao",
        "13º proporcional",
        `O valor equivale a ${fmt(avos)} avos do salário atual — pode incluir médias ou reajuste; precisa do histórico.`
      );
    }
  }
  if (tem("00009")) pendente("rescisao", "Férias indenizadas", "Os dias de direito dependem das faltas no período aquisitivo — precisa do histórico.");
  if (rescisao) pendente("rescisao", "Verbas da rescisão", "Aviso prévio, multa e demais verbas dependem do motivo do desligamento — aguardando tabela de motivos.");

  const ordem: Record<string, number> = { erro: 3, alerta: 2, pendente: 1, ok: 0 };
  const status = criticas.reduce<ResultadoFuncionario["status"]>(
    (pior, c) => (c.status !== "info" && ordem[c.status] > ordem[pior] ? c.status : pior),
    "ok"
  );

  return {
    matricula: f.matricula,
    nome: f.nome,
    funcao: f.funcao,
    situacao: f.situacao,
    categoria,
    salarioBase: f.salarioBase,
    proventos: arred(proventos),
    descontos: arred(descontos),
    liquido: arred(codigoLiquido ? val(codigoLiquido) : proventos - descontos),
    fgts: arred(val("00993") + val("00913")),
    inss: arred(inssTotal + val("00452")),
    ir: arred(irTotal),
    consignado: arred(consignado),
    divisorHoras,
    criticas,
    status,
  };
}

// Horas "A Pagar" que o Banco de Horas calculou para a competência, por matrícula (6 dígitos).
// `aPagarRescisao` soma o saldo positivo que sobra no banco, pago junto na rescisão.
export type BancoHorasCompetencia = Map<string, { aPagar: number; aPagarRescisao: number }>;

// `bancoHoras` null = o banco de horas da competência ainda não foi importado; aí a conferência
// da hora extra 50% não é feita (a tela avisa) e entra sozinha quando ele for importado.
export function conferirFolha(funcionarios: FuncionarioFolha[], competencia: string, bancoHoras: BancoHorasCompetencia | null = null) {
  const ano = Number(competencia.split("/")[1]);
  const { parametros, exato } = parametrosDoAno(ano);
  const calendario = calendarioCompetencia(competencia);
  const salarioMotorista = salarioMotoristaDaFolha(funcionarios) ?? parametros.salarioMotoristaPadrao;
  const resultados = funcionarios.map((f) => {
    const resultado = conferirFuncionario(f, competencia, calendario, parametros, salarioMotorista);
    const conferido = conferirComSalarioAnterior(f, resultado, competencia, calendario, parametros, salarioMotorista) ?? resultado;
    return bancoHoras ? conferirBancoHoras(f, conferido, bancoHoras, parametros) : conferido;
  });
  return { resultados, calendario, anoParametros: parametros.ano, parametrosExatos: exato, salarioMotorista };
}

function piorStatus(criticas: Critica[]): ResultadoFuncionario["status"] {
  const ordem: Record<string, number> = { erro: 3, alerta: 2, pendente: 1, ok: 0 };
  return criticas.reduce<ResultadoFuncionario["status"]>(
    (pior, c) => (c.status !== "info" && ordem[c.status] > ordem[pior] ? c.status : pior),
    "ok"
  );
}

// Funções fora do Banco de Horas na folha (o nome da função vem cortado em 15 letras): motorista
// escolar recebe hora extra fixa de 2h por dia trabalhado, não sai do banco de horas.
const FUNCOES_FORA_BANCO_HORAS = ["MOTORISTA ESCOL"];

// A hora extra 50% (00003) da folha sai do arquivo "A Pagar" do Banco de Horas — confere as horas.
// Na rescisão, as horas do banco vêm em HORAS EXTRAS B-H (00659) junto com o saldo que sobrou.
function conferirBancoHoras(
  f: FuncionarioFolha,
  resultado: ResultadoFuncionario,
  bancoHoras: BancoHorasCompetencia,
  p: ParametrosFolha
): ResultadoFuncionario {
  const funcao = f.funcao.trim().toUpperCase();
  if (FUNCOES_FORA_BANCO_HORAS.some((nome) => funcao.startsWith(nome))) return resultado;

  const ev = (codigo: string) => f.eventos.find((e) => e.codigo === codigo);
  const horasFolha = (ev("00003")?.referencia ?? 0) + (ev("00659")?.referencia ?? 0);
  const bh = bancoHoras.get(f.matricula);
  const titulo = "Hora extra 50% x Banco de horas";
  const fmtH = (h: number) => `${fmt(h)}h`;
  const criticas = [...resultado.criticas];

  if (!bh) {
    if (horasFolha > 0.001) {
      criticas.push({
        regra: "banco_horas",
        titulo,
        status: "pendente",
        encontrado: arred(horasFolha),
        detalhe: `A folha pagou ${fmtH(horasFolha)} de hora extra 50%, mas não há apuração do banco de horas para esta matrícula na competência.`,
      });
    }
    return { ...resultado, criticas, status: piorStatus(criticas) };
  }

  const rescisao = resultado.categoria === "rescisao";
  const esperado = rescisao ? bh.aPagarRescisao : bh.aPagar;
  if (esperado < 0.001 && horasFolha < 0.001) return resultado;

  // Valor de 1h extra 50%, para mostrar a diferença em reais: tirado do próprio evento quando
  // existe; senão, salário ÷ divisor da jornada × 1,5.
  const evHora = ev("00003")?.referencia ? ev("00003")! : ev("00659");
  const divisorFixo = p.jornada42h.funcoes.includes(funcao) ? p.jornada42h.divisor : null;
  const valorHora = evHora?.referencia
    ? evHora.valor / evHora.referencia
    : (f.salarioBase / (resultado.divisorHoras ?? divisorFixo ?? p.divisoresHora[0])) * 1.5;
  const diferenca = arred(horasFolha - esperado);
  const base = rescisao
    ? `Banco de horas na rescisão ${fmtH(esperado)} (a pagar no mês + saldo do banco) × folha ${fmtH(horasFolha)}.`
    : `Banco de horas ${fmtH(esperado)} a pagar × folha ${fmtH(horasFolha)}.`;

  if (Math.abs(diferenca) <= 0.011) {
    criticas.push({ regra: "banco_horas", titulo, status: "ok", esperado: arred(esperado), encontrado: arred(horasFolha), detalhe: base });
  } else if (rescisao && horasFolha < 0.001 && !f.eventos.some((e) => e.coluna === "provento")) {
    // Desligado sem nenhuma verba na folha (ex.: acordo, pago em ATA): não dá para conferir aqui.
    criticas.push({
      regra: "banco_horas",
      titulo,
      status: "pendente",
      esperado: arred(esperado),
      encontrado: 0,
      detalhe: `O banco de horas tem ${fmtH(esperado)} a pagar, mas o desligamento veio sem verbas na folha (ex.: acordo pago em ATA) — será conferido com a tabela de motivos de desligamento.`,
    });
  } else {
    const valor = arred(Math.abs(diferenca) * valorHora);
    criticas.push({
      regra: "banco_horas",
      titulo,
      // Na rescisão o período do ponto pode fechar em outra data — alerta para conferir.
      status: rescisao ? "alerta" : "erro",
      esperado: arred(esperado),
      encontrado: arred(horasFolha),
      detalhe: `${base} A folha pagou ${fmtH(Math.abs(diferenca))} a ${diferenca > 0 ? "mais" : "menos"} (cerca de R$ ${fmt(valor)}).`,
    });
  }
  return { ...resultado, criticas, status: piorStatus(criticas) };
}

function ehMotorista(f: FuncionarioFolha): boolean {
  return f.funcao.trim().toUpperCase() === "MOTORISTA";
}

// Salário mais comum entre os funcionários com função exatamente "MOTORISTA" — base do teto da
// contribuição social. Acompanha reajustes (dissídio) sem precisar atualizar o parâmetro.
function salarioMotoristaDaFolha(funcionarios: FuncionarioFolha[]): number | null {
  const contagem = new Map<number, number>();
  for (const f of funcionarios) {
    if (!ehMotorista(f) || f.salarioBase <= 0) continue;
    contagem.set(f.salarioBase, (contagem.get(f.salarioBase) ?? 0) + 1);
  }
  let melhor: number | null = null;
  let maior = 0;
  for (const [salario, n] of contagem) {
    if (n > maior) {
      melhor = salario;
      maior = n;
    }
  }
  return melhor;
}

// Salário alterado no mês (dissídio, promoção, admissão antes do reajuste): o cabeçalho traz o
// salário novo, mas os valores do mês saem sobre o salário efetivamente pago. Deduzimos esse
// salário pelo "salário normal" (ou saldo de salário) e reconferimos só as críticas com erro.
function conferirComSalarioAnterior(
  f: FuncionarioFolha,
  resultado: ResultadoFuncionario,
  competencia: string,
  calendario: CalendarioCompetencia,
  p: ParametrosFolha,
  salarioMotorista: number
): ResultadoFuncionario | null {
  if (!resultado.criticas.some((c) => c.status === "erro")) return null;
  const dissidio = f.eventos.some((e) => e.codigo === "00413");
  const salario = f.eventos.find((e) => (e.codigo === "00001" || e.codigo === "00188") && e.referencia);
  if (!salario?.referencia) return null;
  const salarioAnterior = arred((salario.valor / salario.referencia) * 30);
  if (Math.abs(salarioAnterior - f.salarioBase) < 1) return null;

  const alternativo = conferirFuncionario({ ...f, salarioBase: salarioAnterior }, competencia, calendario, p, salarioMotorista);
  let trocou = 0;
  const criticas = resultado.criticas.map((c) => {
    if (c.status !== "erro") return c;
    if (c.regra === "salario") {
      // O próprio salário pago é a evidência da alteração — vira pendência para confirmar.
      return {
        ...c,
        status: "pendente" as const,
        detalhe: `${c.detalhe} O salário pago no mês (${fmt(salarioAnterior)}) é diferente do salário do cadastro (${fmt(f.salarioBase)}) — confirmar ${dissidio ? "o reajuste do dissídio" : "a alteração salarial no mês"}.`,
      };
    }
    const alt = alternativo.criticas.find((a) => a.regra === c.regra && a.titulo === c.titulo);
    if (alt?.status !== "ok") return c;
    trocou++;
    return { ...alt, detalhe: `${alt.detalhe} (sobre o salário pago no mês, ${fmt(salarioAnterior)})` };
  });
  if (trocou === 0) return null;
  criticas.push({
    regra: "salario_alterado",
    titulo: "Salário alterado no mês",
    status: "info",
    detalhe: dissidio
      ? `Houve dissídio no mês: ${trocou} cálculo(s) conferido(s) com o salário anterior ao reajuste (${fmt(salarioAnterior)}); a diferença foi paga em DIF DISSIDIO.`
      : `${trocou} cálculo(s) conferido(s) com o salário efetivamente pago no mês (${fmt(salarioAnterior)}), diferente do cadastro (${fmt(f.salarioBase)}).`,
  });
  const ordem: Record<string, number> = { erro: 3, alerta: 2, pendente: 1, ok: 0 };
  const status = criticas.reduce<ResultadoFuncionario["status"]>(
    (pior, c) => (c.status !== "info" && ordem[c.status] > ordem[pior] ? c.status : pior),
    "ok"
  );
  return { ...resultado, criticas, status };
}
