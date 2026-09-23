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
  // Sem linha própria no relatório — sempre null aqui, entram editáveis (usados só pra excluir
  // aprendiz da conta de turnover, ver calcularDerivados).
  aprendizesAtivos: number | null;
  aprendizesAdmitidos: number | null;
  aprendizesDesligados: number | null;
  // Idem — vem só pela importação do relatório de Admitidos/Desligados (motivo "TRANSFERENCIA (
  // COM ONUS )"), nunca do PDF.
  desligadosTransferencia: number | null;
  folhaBruta: number | null;
  liquidoPagar: number | null;
  horaExtra: number | null;
  horaExtraHoras: number | null;
  comissao: number | null;
  // Nunca vem do PDF — sempre fica null aqui, pra entrar zerado e editável na tela de importação
  // (a folha suplementar é processada à parte, fora desse relatório).
  folhaSuplementar: number | null;
  faltasDias: number | null;
  faltasValor: number | null;
  atestadosDias: number | null;
  atestadosValor: number | null;
  inssRetido: number | null;
  fgts: number | null;
  // Encargos patronais: "INSS da Empresa" (parte patronal), "Acidente de Trabalho" (RAT/SAT — não
  // confundir com "Acidente de Trabalho Ag.Nocivo", linha separada) e "Terceiros".
  inssPatronal: number | null;
  acidenteTrabalho: number | null;
  terceiros: number | null;
  // Descontos por código (o nome do fornecedor de farmácia varia por empresa, por isso vai pelo
  // código, não pelo rótulo): 00381 farmácia, 00492 contribuição confederativa, 00493 contribuição
  // social (sindical).
  farmacia: number | null;
  contribuicaoConfederativa: number | null;
  contribuicaoSocial: number | null;
  // Crus — o IRRF "do mês" exibido no dashboard combina irrfFerias desta competência com o
  // irrfNormal da competência ANTERIOR (ver src/app/admin/indicadores/actions.ts).
  irrfFerias: number | null;
  irrfNormal: number | null;
  // Vêm do PDF (códigos 00970, 00972, 00971).
  cestaBasica: number | null;
  valeGas: number | null;
  valeAlimentacao: number | null;
  // Não têm código no relatório — sempre ficam null aqui, entram editáveis na tela de importação.
  cafeManha: number | null;
  refeitorio: number | null;
  proSaude: number | null;
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

// O relatório lista PROVENTO e DESCONTO lado a lado na mesma linha ("00119 DSR S/ AD ... 00508
// FALTAS ..."), e a extração do texto do PDF gruda os dois blocos numa linha só. Isola só o trecho
// do código procurado: começa DEPOIS do rótulo (não pega os números do código vizinho à esquerda,
// quando o nosso é o da direita) e termina antes do próximo código de 5 dígitos (não pega os
// números do vizinho à direita, quando o nosso é o da esquerda).
const PROXIMO_CODIGO = /\s\d{5}\s+\S/;

function linhaAteProximoCodigo(linha: string, apartirDe: number): string {
  const resto = linha.slice(apartirDe);
  const m = PROXIMO_CODIGO.exec(resto);
  return m ? resto.slice(0, m.index) : resto;
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
  // Sem linha própria no relatório — sempre editável na tela de importação.
  const aprendizesAtivos = null;
  const aprendizesAdmitidos = null;
  const aprendizesDesligados = null;
  const desligadosTransferencia = null;

  const folhaBruta = ultimoNumeroAposRotulo(texto, /TOTAIS PROVENTOS/, /TOTAIS DESCONTOS/);
  const liquidoPagar = ultimoNumeroAposRotulo(texto, /Liquido a Pagar/);
  // INSS RETIDO do funcionário (não o total patronal+retido) — linha própria no relatório.
  const inssRetido = ultimoNumeroAposRotulo(texto, /INSS Retido dos Funcionarios/i);
  // Soma "Deposito FGTS" + "Deposito FGTS (Categoria 07)" — exclui só a linha "(Contr. Social)".
  const fgts = somarPorDescricao(texto, /Deposito FGTS(?!\s*\(Contr)/)?.total ?? null;
  // INSS da Empresa (parte patronal, distinta do INSS Retido dos Funcionários acima).
  const inssPatronal = ultimoNumeroAposRotulo(texto, /INSS da Empresa/i);
  // "Acidente de Trabalho" (RAT/SAT) — não pode casar com a linha separada "Acidente de Trabalho
  // Ag.Nocivo" logo abaixo dela no relatório.
  const acidenteTrabalho = ultimoNumeroAposRotulo(texto, /Acidente de Trabalho(?!\s*Ag)/i);
  const terceiros = ultimoNumeroAposRotulo(texto, /\bTerceiros\b/i);
  // Código 00381 (nome do fornecedor de farmácia varia por empresa, ex. "BIG MASTER").
  // Sem âncora de início de linha — esses códigos podem vir como o segundo código colado na mesma
  // linha de um provento/desconto vizinho (mesmo caso do FALTAS/CESTA BASICA acima), então casa em
  // qualquer posição da linha; linhaAteProximoCodigo() já isola só o trecho certo a partir daí.
  const farmacia = ultimoNumeroAposRotulo(texto, /\b00381\b/);
  const contribuicaoConfederativa = ultimoNumeroAposRotulo(texto, /\b00492\b/);
  const contribuicaoSocial = ultimoNumeroAposRotulo(texto, /\b00493\b/);
  // IRRF normal (código 00453) e IRRF sobre férias (código 00481) ficam CRUS — o valor "do mês"
  // combina os dois em competências diferentes (ver módulo do dashboard), então aqui só extrai
  // cada um separado, sem somar.
  const irrfFerias = ultimoNumeroAposRotulo(texto, /\b00481\s+IRF FERIAS/i);
  const irrfNormal = ultimoNumeroAposRotulo(texto, /\b00453\s+I\.R\.F\./i);
  // Hora extra 50% = códigos 00003 + 00659 somados (valor em R$ e a referência em horas).
  const horaExtraSoma = somarPorDescricao(texto, /^\s*(00003|00659)\b/m);
  const horaExtra = horaExtraSoma?.total ?? null;
  const horaExtraHoras = horaExtraSoma?.quantidade ?? null;
  // Código 00227.
  const comissao = ultimoNumeroAposRotulo(texto, /^\s*00227\b/m);
  // Não tem código no relatório — sempre editável na tela de importação.
  const folhaSuplementar = null;

  // Quantidade de dias de falta e valor descontado — código 00508 (REFER = dias).
  const faltasSoma = somarPorDescricao(texto, /\b00508\s+FALTAS/);
  const faltasDias = faltasSoma?.quantidade ?? null;
  const faltasValor = faltasSoma?.total ?? null;
  const atestadosSoma = somarPorDescricao(texto, /\b00752\s+ATESTADO M/);
  const atestadosDias = atestadosSoma?.quantidade ?? null;
  const atestadosValor = atestadosSoma?.total ?? null;

  const cestaBasica = ultimoNumeroAposRotulo(texto, /\b00970\s+0\s+CESTA BASICA/);
  const valeGas = ultimoNumeroAposRotulo(texto, /\b00972\s+2\s+VALE GAS/);
  const valeAlimentacao = ultimoNumeroAposRotulo(texto, /\b00971\s+1\s+ALIMENTACAO CARTAO/);
  // Sem código no relatório — sempre editáveis na tela de importação.
  const cafeManha = null;
  const refeitorio = null;
  const proSaude = null;

  return {
    setor,
    ativos,
    admitidos,
    desligados,
    afastados,
    aprendizesAtivos,
    aprendizesAdmitidos,
    aprendizesDesligados,
    desligadosTransferencia,
    folhaBruta,
    liquidoPagar,
    horaExtra,
    horaExtraHoras,
    comissao,
    folhaSuplementar,
    faltasDias,
    faltasValor,
    atestadosDias,
    atestadosValor,
    inssRetido,
    fgts,
    inssPatronal,
    acidenteTrabalho,
    terceiros,
    farmacia,
    contribuicaoConfederativa,
    contribuicaoSocial,
    irrfFerias,
    irrfNormal,
    cestaBasica,
    valeGas,
    valeAlimentacao,
    cafeManha,
    refeitorio,
    proSaude,
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
