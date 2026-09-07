// PDF mensal "Resumo Gerencial Analítico" (folha de pagamento). O texto extraído do PDF não
// preserva alinhamento de coluna como um TXT de largura fixa — por isso a extração é por RÓTULO
// (nome do campo na linha), pegando o último número da linha como "total" (ou o primeiro quando o
// número é uma quantidade/REFER, não um valor em R$) em vez de depender de posição de coluna.
//
// Nem todo campo aparece garantido em todo arquivo — quando o rótulo não é encontrado, o campo
// fica null e a tela de importação deixa em aberto pra edição manual, em vez de dar erro.

export type ResumoGerencialLinha = {
  setor: string; // "MANUTENCAO" | "ADMINISTRACAO" | "OPERACAO" | "OPERACAO MOTORISTA"
  ativos: number | null;
  admitidos: number | null;
  desligados: number | null;
  afastados: number | null;
  folhaBruta: number | null;
  liquidoPagar: number | null;
  horaExtra: number | null;
  horaExtraHoras: number | null;
  faltasDias: number | null;
  faltasValor: number | null;
  atestadosDias: number | null;
  atestadosValor: number | null;
  inssRetido: number | null;
  fgts: number | null;
  // Crus — o IRRF "do mês" exibido no dashboard combina irrfFerias desta competência com o
  // irrfNormal da competência ANTERIOR (ver src/app/admin/indicadores/actions.ts).
  irrfFerias: number | null;
  irrfNormal: number | null;
  custoBeneficios: number | null;
};

export type ResumoGerencialParseResult = {
  empresaCodigo: string;
  competencia: string; // "mm/yyyy"
  linhas: ResumoGerencialLinha[];
};

// Só essas 4 áreas interessam ao dashboard — o relatório pode trazer outras divisões
// (Almoxarifado, Ag. Vendas etc.) que são ignoradas.
const SETORES_ALVO = ["MANUTENCAO", "ADMINISTRACAO", "OPERACAO", "OPERACAO MOTORISTA"];

const EMPRESA_CODIGO = /^\s*(\d{3})\s+[A-Z]/m;
const COMPETENCIA = /COMPETENCIA\s+(\d{2})\/(\d{2})\/(\d{4})/;
const DIVISAO_HEADER = /DIVISAO:\s*[\d.]+\s*-\s*[^/\n]+\/([A-Z][A-Z ]*?)\s*(?:\(CONT\))?\s*(?:\r?\n|$)/g;

const NUMERO = /-|\d{1,3}(?:\.\d{3})*,\d{2}/g;

function paraNumero(token: string): number {
  return token.trim() === "-" ? 0 : Number(token.replace(/\./g, "").replace(",", "."));
}

function numerosNaLinha(linha: string): number[] {
  return [...linha.matchAll(NUMERO)].map((m) => paraNumero(m[0]));
}

// O relatório lista PROVENTO e DESCONTO lado a lado na mesma linha ("00003 HORA EXTRA ... 00481
// IRF FERIAS ..."), e a extração do texto do PDF gruda os dois blocos numa linha só — por isso
// "pegar o último número da linha" pra um código do lado esquerdo acabava trazendo o total do
// código vizinho à direita. Corta a linha assim que aparece outro código de 5 dígitos depois do
// ponto onde o rótulo procurado foi encontrado.
const PROXIMO_CODIGO = /\s\d{5}\s+\S/;

function linhaAteProximoCodigo(linha: string, apartirDe: number): string {
  const resto = linha.slice(apartirDe);
  const m = PROXIMO_CODIGO.exec(resto);
  return m ? linha.slice(0, apartirDe + m.index) : linha;
}

// Pega o último número da primeira linha (a partir do início do arquivo) que contém `rotulo`.
// Além do corte automático no próximo código (ver acima), `rotuloCorte` corta num ponto marcado
// por texto (ex.: "TOTAIS PROVENTOS ... TOTAIS DESCONTOS ..." — o segundo rótulo não é um código,
// então o corte automático não pega, precisa ser indicado à parte).
function ultimoNumeroAposRotulo(texto: string, rotulo: RegExp, rotuloCorte?: RegExp): number | null {
  for (const linha of texto.split(/\r?\n/)) {
    const m = rotulo.exec(linha);
    if (!m) continue;
    let trecho = linhaAteProximoCodigo(linha, m.index + m[0].length);
    if (rotuloCorte) {
      const corte = rotuloCorte.exec(trecho);
      if (corte) trecho = trecho.slice(0, corte.index);
    }
    const numeros = numerosNaLinha(trecho);
    if (numeros.length > 0) return numeros[numeros.length - 1];
  }
  return null;
}

function inteiroAposRotulo(texto: string, rotulo: RegExp): number | null {
  for (const linha of texto.split(/\r?\n/)) {
    const m = rotulo.exec(linha);
    if (m) return Number(m[1]);
  }
  return null;
}

// Alguns totais são espalhados por MAIS DE UM código no relatório (ex.: hora extra tem um código
// por percentual/tipo) — em vez de depender de um código fixo só, casa por trecho da descrição e
// soma todas as linhas que baterem. Retorna também o primeiro número de cada linha somado (a
// quantidade/REFER, ex. horas), útil pra campos onde isso é uma informação própria, não só o R$.
function somarPorDescricao(texto: string, descricao: RegExp): { quantidade: number; total: number } | null {
  let quantidade = 0;
  let total = 0;
  let achou = false;
  for (const linha of texto.split(/\r?\n/)) {
    const m = descricao.exec(linha);
    if (!m) continue;
    const trecho = linhaAteProximoCodigo(linha, m.index + m[0].length);
    const numeros = numerosNaLinha(trecho);
    if (numeros.length === 0) continue;
    achou = true;
    quantidade += numeros[0];
    total += numeros[numeros.length - 1];
  }
  return achou ? { quantidade, total } : null;
}

function extrairCampos(setor: string, texto: string): ResumoGerencialLinha {
  const ativos = inteiroAposRotulo(texto, /Ativos\s*\(Inclus\.\s*ferias\):\s*(\d+)/);
  const admitidos = inteiroAposRotulo(texto, /Admitidos\.*:\s*(\d+)/);
  const desligados = inteiroAposRotulo(texto, /Desligados\.*:\s*(\d+)/);
  const afastados = inteiroAposRotulo(texto, /Afastados\.*:\s*(\d+)/);

  const folhaBruta = ultimoNumeroAposRotulo(texto, /TOTAIS PROVENTOS/, /TOTAIS DESCONTOS/);
  const liquidoPagar = ultimoNumeroAposRotulo(texto, /Liquido a Pagar/);
  // INSS RETIDO do funcionário (não o total patronal+retido) — linha própria no relatório.
  const inssRetido = ultimoNumeroAposRotulo(texto, /INSS Retido dos Funcionarios/i);
  const fgts = ultimoNumeroAposRotulo(texto, /Deposito FGTS(?!\s*\()/);
  // IRRF normal (código 00453) e IRRF sobre férias (código 00481) ficam CRUS — o valor "do mês"
  // combina os dois em competências diferentes (ver módulo do dashboard), então aqui só extrai
  // cada um separado, sem somar.
  const irrfFerias = ultimoNumeroAposRotulo(texto, /\b00481\s+IRF FERIAS/i);
  const irrfNormal = ultimoNumeroAposRotulo(texto, /\b00453\s+I\.R\.F\./i);
  // Hora extra 50% = códigos 00003 + 00659 somados (valor em R$ e a referência em horas).
  const horaExtraSoma = somarPorDescricao(texto, /^\s*(00003|00659)\b/m);
  const horaExtra = horaExtraSoma?.total ?? null;
  const horaExtraHoras = horaExtraSoma?.quantidade ?? null;

  const faltasSoma = somarPorDescricao(texto, /\b00508\s+FALTAS/);
  const faltasDias = faltasSoma?.quantidade ?? null;
  const faltasValor = faltasSoma?.total ?? null;
  const atestadosSoma = somarPorDescricao(texto, /\b00752\s+ATESTADO M/);
  const atestadosDias = atestadosSoma?.quantidade ?? null;
  const atestadosValor = atestadosSoma?.total ?? null;

  const cesta = ultimoNumeroAposRotulo(texto, /\b00970\s+0\s+CESTA BASICA/);
  const alimentacao = ultimoNumeroAposRotulo(texto, /\b00971\s+1\s+ALIMENTACAO CARTAO/);
  const valeGas = ultimoNumeroAposRotulo(texto, /\b00972\s+2\s+VALE GAS/);
  const custoBeneficios =
    cesta === null && alimentacao === null && valeGas === null
      ? null
      : (cesta ?? 0) + (alimentacao ?? 0) + (valeGas ?? 0);

  return {
    setor,
    ativos,
    admitidos,
    desligados,
    afastados,
    folhaBruta,
    liquidoPagar,
    horaExtra,
    horaExtraHoras,
    faltasDias,
    faltasValor,
    atestadosDias,
    atestadosValor,
    inssRetido,
    fgts,
    irrfFerias,
    irrfNormal,
    custoBeneficios,
  };
}

export function parseResumoGerencial(conteudo: string): ResumoGerencialParseResult {
  const empresaMatch = EMPRESA_CODIGO.exec(conteudo);
  if (!empresaMatch) {
    throw new Error("Não encontrei o código da empresa no cabeçalho do relatório.");
  }
  const empresaCodigo = empresaMatch[1];

  const competenciaMatch = COMPETENCIA.exec(conteudo);
  if (!competenciaMatch) {
    throw new Error("Não encontrei a competência (COMPETENCIA dd/mm/aaaa) no relatório.");
  }
  const competencia = `${competenciaMatch[2]}/${competenciaMatch[3]}`;

  // Divide o texto em blocos por cabeçalho de divisão e agrupa os trechos que pertencem ao mesmo
  // setor. O relatório repete o cabeçalho da divisão numa página "(CONT)" — às vezes essa linha
  // também bate com DIVISAO_HEADER (aí vira um marcador extra do MESMO setor), às vezes não (tem
  // texto colado depois que impede o casamento). Os dois casos são tratados igual aqui: o bloco de
  // um marcador vai até o PRÓXIMO marcador da lista (de qualquer setor-alvo), e como o texto de
  // cada marcador é concatenado por setor no fim, um "(CONT)" que reaparece como marcador não perde
  // dado nenhum — só corta o trecho em mais um pedaço, que é remontado pela concatenação.
  const marcadores: { indice: number; fim: number; setor: string }[] = [];
  for (const m of conteudo.matchAll(DIVISAO_HEADER)) {
    const setor = m[1].trim().replace(/\s+/g, " ");
    if (!SETORES_ALVO.includes(setor)) continue;
    marcadores.push({ indice: m.index!, fim: m.index! + m[0].length, setor });
  }

  if (marcadores.length === 0) {
    throw new Error(
      "Nenhuma das divisões esperadas (Manutenção, Administração, Operação, Operação Motorista) foi encontrada no relatório."
    );
  }

  const textoPorSetor = new Map<string, string>();
  for (let i = 0; i < marcadores.length; i++) {
    const marcador = marcadores[i];
    const fimBloco = marcadores[i + 1]?.indice ?? conteudo.length;
    const trecho = conteudo.slice(marcador.fim, fimBloco);
    textoPorSetor.set(marcador.setor, (textoPorSetor.get(marcador.setor) ?? "") + "\n" + trecho);
  }

  const linhas = SETORES_ALVO.filter((s) => textoPorSetor.has(s)).map((setor) =>
    extrairCampos(setor, textoPorSetor.get(setor)!)
  );

  return { empresaCodigo, competencia, linhas };
}
