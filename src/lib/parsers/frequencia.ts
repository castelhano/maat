// Relatório "FRQ - Realizado x Programado" (Praxio). Uma linha por colaborador/dia, em colunas de
// largura fixa: a escala programada (linha, carro/serviço, entrada, saída, horas) à esquerda e o
// que foi realizado à direita, separados do bloco de diferenças por "|". Quando o dia tem mais de
// um trecho (dupla pegada, madrugada + manhã), os demais vêm em linhas de continuação logo abaixo,
// sem código nem data. No lugar do realizado pode vir uma ocorrência ("* ATESTADO MEDI *").
// As páginas finais ("RESUMO ... POR FUNCIONARIO") não são usadas.

export type TrechoFrequencia = {
  linha: string;
  servico: string;
  // "hh:mm"
  entrada: string;
  saida: string;
  // Duração em minutos (passa da meia-noite quando a saída é menor que a entrada).
  minutos: number;
};

export type DiaFrequencia = {
  matricula: string;
  funcao: string;
  // "dd/mm/aaaa"
  data: string;
  programado: TrechoFrequencia[];
  realizado: TrechoFrequencia[];
  // Texto da ocorrência no lugar do realizado (ex.: "ATESTADO MEDI", "FALTA  JUSTIF").
  ocorrencia: string | null;
};

export type FrequenciaParseResult = {
  empresa: { codigo: string; nome: string };
  // "dd/mm/aaaa"
  periodo: { inicio: string; fim: string };
  dias: DiaFrequencia[];
};

const EMPRESA = /EMPRESA\s*:\s*(\d{3})\s+(.+?)\s{2,}/;
const PERIODO = /PERIODO DE:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/;
// A função ocupa 16 posições e pode encostar na data ("PROMOT DE VENDAS01/09/2026").
const LINHA_DIA = /^ (\d{6}) (.{16})(\d{2}\/\d{2}\/\d{4}) /;
const HORA = /^(\d{2}):(\d{2})$/;
const OCORRENCIA = /\*\s*(.+?)\s*\*/;

// Posições das colunas (o "|" que fecha o realizado fica na posição 112).
const PROGRAMADO = 35;
const REALIZADO = 74;
const FIM_REALIZADO = 112;

export function minutosDoHorario(hhmm: string): number {
  const m = HORA.exec(hhmm);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Bloco de 39 posições: linha (10), carro/serviço (11), entrada, saída e horas (6 cada).
function lerTrecho(bloco: string): TrechoFrequencia | null {
  const linha = bloco.slice(0, 10).trim();
  const servico = bloco.slice(10, 21).trim();
  const entrada = bloco.slice(21, 26);
  const saida = bloco.slice(27, 32);
  const ini = minutosDoHorario(entrada);
  const fim = minutosDoHorario(saida);
  if (Number.isNaN(ini) || Number.isNaN(fim)) return null;
  // "00:00 00:00 00:00" sem linha = dia sem escala (folga/compensação).
  if (!linha && !servico && ini === 0 && fim === 0) return null;
  return { linha, servico, entrada, saida, minutos: (fim - ini + 1440) % 1440 };
}

export function parseFrequencia(conteudo: string): FrequenciaParseResult {
  const linhas = conteudo.split(/\r?\n/);

  let empresa: { codigo: string; nome: string } | null = null;
  let periodo: { inicio: string; fim: string } | null = null;
  const dias: DiaFrequencia[] = [];
  let atual: DiaFrequencia | null = null;

  for (const linha of linhas) {
    if (!empresa) {
      const m = EMPRESA.exec(linha);
      if (m) empresa = { codigo: m[1], nome: m[2].trim() };
    }
    if (!periodo) {
      const m = PERIODO.exec(linha);
      if (m) periodo = { inicio: m[1], fim: m[2] };
    }

    if (linha.length <= FIM_REALIZADO || linha[FIM_REALIZADO] !== "|") {
      // Cabeçalho, rodapé ou página de resumo: encerra o colaborador corrente.
      if (!/^\s*$/.test(linha)) atual = null;
      continue;
    }

    const cabecalho = LINHA_DIA.exec(linha);
    if (cabecalho) {
      atual = {
        matricula: cabecalho[1],
        funcao: cabecalho[2].trim(),
        data: cabecalho[3],
        programado: [],
        realizado: [],
        ocorrencia: null,
      };
      dias.push(atual);
    } else if (!atual || linha.slice(0, PROGRAMADO).trim() !== "") {
      // Linha de colaborador não reconhecida: as continuações dela não podem cair no anterior.
      atual = null;
      continue;
    }

    const programado = lerTrecho(linha.slice(PROGRAMADO, REALIZADO));
    if (programado) atual.programado.push(programado);

    const blocoRealizado = linha.slice(REALIZADO, FIM_REALIZADO);
    const realizado = lerTrecho(blocoRealizado);
    if (realizado) {
      atual.realizado.push(realizado);
    } else if (cabecalho) {
      const m = OCORRENCIA.exec(blocoRealizado);
      if (m) atual.ocorrencia = m[1];
    }
  }

  if (!empresa || !periodo) {
    throw new Error("Arquivo não reconhecido — esperado o relatório FRQ - Realizado x Programado (.TXT).");
  }
  if (dias.length === 0) throw new Error("Nenhum colaborador encontrado no arquivo.");

  return { empresa, periodo, dias };
}
