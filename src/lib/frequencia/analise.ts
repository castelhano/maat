// Análise de frequência: compara a escala programada com o realizado de cada colaborador/dia do
// relatório "Realizado x Programado" e levanta os alertas combinados com o DP:
//   - jornada curta: trabalhou menos de 4h no dia (somando os trechos), ou não marcou nada estando
//     escalado e sem ocorrência que justifique;
//   - excesso: passou de 11h no dia (dobra/estendeu);
//   - HE: no mesmo turno da escala, entrou mais de 20 min antes do programado e/ou saiu mais de
//     45 min depois — suspeita de marcação para gerar hora extra;
//   - troca de escala: com 1h ou mais de diferença na entrada, trabalhou em outro turno
//     (madrugada/manhã/tarde) ou em outra linha; entrou 1h ou mais depois do programado; ou
//     trabalhou num dia sem escala;
//   - interjornada: descansou menos de 11h entre a saída de um dia e a entrada do seguinte (CLT 66).
//     Com o fracionamento ligado (art. 235-C, §3º, Lei 13.103/2015), um descanso de 8h a 11h é aceito
//     quando as pausas entre os trechos (da dupla pegada do dia anterior e do dia seguinte, este
//     dentro das 16h após a entrada) completam as 11h. Atenção: o STF declarou esse fracionamento inconstitucional (ADI 5322, a partir de
//     12/07/2023) — por isso ele é opcional na tela;
//   - ocorrência: atestado, compensação, curso, faltas, suspensão etc. — só informativo. Folga,
//     feriado e folga prêmio são dias normais sem escala e não aparecem na análise.
//
// Escala da madrugada: o ERP lança no dia D o trecho que começa às 23h do dia anterior (ex.: 23:25
// às 04:20 + 05:09 às 09:59). Por isso um trecho que entra a partir das 22h é posicionado na noite
// anterior — a menos que o dia tenha um trecho da tarde, caso em que ele é a continuação dela.

import { minutosDoHorario, type DiaFrequencia, type TrechoFrequencia } from "@/lib/parsers/frequencia";

export const LIMITE_JORNADA_CURTA = 4 * 60;
export const LIMITE_EXCESSO = 11 * 60;
// HE: alerta acima destes minutos de entrada antecipada / saída prorrogada.
export const LIMITE_HE_ENTRADA = 20;
export const LIMITE_HE_SAIDA = 45;
export const LIMITE_ATRASO_TROCA = 60;
export const LIMITE_INTERJORNADA = 11 * 60;
export const MINIMO_PRIMEIRO_PERIODO = 8 * 60;
export const JANELA_REMANESCENTE = 16 * 60;

export type Turno = "madrugada" | "manha" | "tarde";

export const ROTULO_TURNO: Record<Turno, string> = {
  madrugada: "madrugada",
  manha: "manhã",
  tarde: "tarde",
};

// Madrugada: entrada das 22:00 às 03:59 · Manhã: 04:00 às 11:59 · Tarde: 12:00 às 21:59.
export function turnoDaEntrada(minutos: number): Turno {
  if (minutos >= 22 * 60 || minutos < 4 * 60) return "madrugada";
  if (minutos < 12 * 60) return "manha";
  return "tarde";
}

export type TipoAlerta = "jornada_curta" | "excesso" | "interjornada" | "he" | "troca" | "ocorrencia";

export const TIPOS_ALERTA: TipoAlerta[] = ["jornada_curta", "excesso", "interjornada", "he", "troca", "ocorrencia"];

export type AlertaFrequencia = { tipo: TipoAlerta; detalhe: string };

// Trecho com início/fim em minutos contados a partir da 00:00 do dia do movimento (negativo =
// começou na noite anterior; acima de 1440 = terminou no dia seguinte).
export type TrechoPosicionado = TrechoFrequencia & { inicio: number; fim: number };

export type DiaAnalisado = {
  data: string;
  programado: TrechoPosicionado[];
  realizado: TrechoPosicionado[];
  ocorrencia: string | null;
  minutosProgramados: number;
  minutosRealizados: number;
  turnoProgramado: Turno | null;
  turnoRealizado: Turno | null;
  // Minutos de entrada antecipada / saída prorrogada que geraram alerta de HE (0 = sem alerta).
  heEntrada: number;
  heSaida: number;
  alertas: AlertaFrequencia[];
};

export type ColaboradorAnalisado = {
  matricula: string;
  funcao: string;
  dias: DiaAnalisado[];
  diasTrabalhados: number;
  minutosRealizados: number;
  heEntrada: number;
  heSaida: number;
  contagem: Record<TipoAlerta, number>;
};

const OCORRENCIAS: Record<string, string> = {
  "ATESTADO MEDI": "Atestado médico",
  "ATESTADO OBIT": "Atestado de óbito",
  "FALTA JUSTIF": "Falta justificada",
  FALTAS: "Falta",
  "COMPENSACAO B": "Compensação (banco de horas)",
  "CURSO APRENDI": "Curso (aprendiz)",
  TREINAMENTO: "Treinamento",
  ABONADO: "Abonado",
  SUSPENSAO: "Suspensão",
};

// Dias de descanso normais: não geram alerta nem entram como ocorrência.
const OCORRENCIAS_IGNORADAS = new Set(["FOLGA", "FERIADO", "FOLGA PREMIO"]);

export function rotuloOcorrencia(texto: string): string {
  const chave = texto.replace(/\s+/g, " ").trim();
  return OCORRENCIAS[chave] ?? chave;
}

export function formatarDuracao(minutos: number): string {
  const sinal = minutos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutos));
  return `${sinal}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

// Horário do relógio de uma posição relativa ao dia do movimento.
export function formatarHorario(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function posicionar(trechos: TrechoFrequencia[]): TrechoPosicionado[] {
  const entradas = trechos.map((t) => minutosDoHorario(t.entrada));
  const temTarde = entradas.some((e) => turnoDaEntrada(e) === "tarde");
  return trechos
    .map((t, i) => {
      const inicio = entradas[i] >= 22 * 60 && !temTarde ? entradas[i] - 1440 : entradas[i];
      return { ...t, inicio, fim: inicio + t.minutos };
    })
    .sort((a, b) => a.inicio - b.inicio);
}

// "206B"/"A06B" são variações da mesma linha (206/A06).
function linhaBase(linha: string) {
  return linha.slice(0, 3);
}

function soma(trechos: TrechoFrequencia[]) {
  return trechos.reduce((acc, t) => acc + t.minutos, 0);
}

function janela(trechos: TrechoPosicionado[]) {
  return `${formatarHorario(trechos[0].inicio)}–${formatarHorario(Math.max(...trechos.map((t) => t.fim)))}`;
}

// temEscala: o colaborador tem escala programada em algum dia do período. Quem não trabalha por escala
// (administrativo, vendas) não tem com o que comparar — sem troca nem HE, só as regras de jornada.
function analisarDia(dia: DiaFrequencia, temEscala: boolean): DiaAnalisado {
  const programado = posicionar(dia.programado);
  const realizado = posicionar(dia.realizado);
  const minutosProgramados = soma(programado);
  const minutosRealizados = soma(realizado);
  const turnoProgramado = programado.length ? turnoDaEntrada(minutosDoHorario(programado[0].entrada)) : null;
  const turnoRealizado = realizado.length ? turnoDaEntrada(minutosDoHorario(realizado[0].entrada)) : null;
  const resultado: DiaAnalisado = {
    data: dia.data,
    programado,
    realizado,
    ocorrencia: dia.ocorrencia,
    minutosProgramados,
    minutosRealizados,
    turnoProgramado,
    turnoRealizado,
    heEntrada: 0,
    heSaida: 0,
    alertas: [],
  };
  const alertas = resultado.alertas;

  if (dia.ocorrencia) {
    if (OCORRENCIAS_IGNORADAS.has(dia.ocorrencia.replace(/s+/g, " ").trim())) return resultado;
    alertas.push({ tipo: "ocorrencia", detalhe: rotuloOcorrencia(dia.ocorrencia) });
    return resultado;
  }
  if (realizado.length === 0) {
    if (programado.length > 0) {
      alertas.push({
        tipo: "jornada_curta",
        detalhe: `Escalado das ${janela(programado)} e nenhuma marcação realizada, sem ocorrência que justifique.`,
      });
    }
    return resultado;
  }

  if (minutosRealizados < LIMITE_JORNADA_CURTA) {
    alertas.push({
      tipo: "jornada_curta",
      detalhe: `Trabalhou ${formatarDuracao(minutosRealizados)} no dia (abaixo de 4:00).`,
    });
  }
  if (minutosRealizados > LIMITE_EXCESSO) {
    alertas.push({
      tipo: "excesso",
      detalhe: `Trabalhou ${formatarDuracao(minutosRealizados)} no dia (acima de 11:00)${
        realizado.length > 1 ? `, somando ${realizado.length} trechos` : ""
      }.`,
    });
  }

  if (programado.length === 0) {
    if (temEscala) alertas.push({ tipo: "troca", detalhe: `Sem escala no dia e trabalhou das ${janela(realizado)}.` });
    return resultado;
  }

  const entradaProg = programado[0].inicio;
  const entradaReal = realizado[0].inicio;
  const saidaProg = Math.max(...programado.map((t) => t.fim));
  const saidaReal = Math.max(...realizado.map((t) => t.fim));

  // Poucos minutos de diferença perto da virada de turno (12:01 x 11:54) não é troca; a partir de 1h,
  // mudar de turno ou assumir outra linha é troca (cobriu a escala de alguém), não hora extra.
  const diferencaGrande = Math.abs(entradaReal - entradaProg) >= LIMITE_ATRASO_TROCA;
  const linhasProgramadas = new Set(programado.map((t) => linhaBase(t.linha)));
  const outraLinha = !linhasProgramadas.has(linhaBase(realizado[0].linha));
  if (diferencaGrande && turnoProgramado !== turnoRealizado) {
    alertas.push({
      tipo: "troca",
      detalhe: `Escalado na ${ROTULO_TURNO[turnoProgramado!]} (${janela(programado)}) e trabalhou na ${
        ROTULO_TURNO[turnoRealizado!]
      } (${janela(realizado)}).`,
    });
    return resultado;
  }
  if (diferencaGrande && outraLinha) {
    alertas.push({
      tipo: "troca",
      detalhe: `Escalado na linha ${programado[0].linha} (${janela(programado)}) e trabalhou na linha ${realizado[0].linha} (${janela(
        realizado
      )}).`,
    });
    return resultado;
  }
  if (entradaReal - entradaProg >= LIMITE_ATRASO_TROCA) {
    alertas.push({
      tipo: "troca",
      detalhe: `Entrou ${formatarDuracao(entradaReal - entradaProg)} depois do programado no mesmo turno (escala ${janela(
        programado
      )}, realizado ${janela(realizado)}).`,
    });
    return resultado;
  }

  const antecipado = entradaProg - entradaReal;
  const prorrogado = saidaReal - saidaProg;
  const partes: string[] = [];
  if (antecipado > LIMITE_HE_ENTRADA) {
    resultado.heEntrada = antecipado;
    partes.push(`entrou ${formatarDuracao(antecipado)} antes (${formatarHorario(entradaReal)} x ${formatarHorario(entradaProg)})`);
  }
  if (prorrogado > LIMITE_HE_SAIDA) {
    resultado.heSaida = prorrogado;
    partes.push(`saiu ${formatarDuracao(prorrogado)} depois (${formatarHorario(saidaReal)} x ${formatarHorario(saidaProg)})`);
  }
  if (partes.length) {
    const texto = partes.join(" e ");
    alertas.push({ tipo: "he", detalhe: texto[0].toUpperCase() + texto.slice(1) + " do programado." });
  }
  return resultado;
}

function diaAbsoluto(data: string): number {
  const [d, m, a] = data.split("/").map(Number);
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

// Minutos absolutos (desde 01/01/1970) → "dd/mm hh:mm".
function formatarDataHora(minutos: number): string {
  const data = new Date(Math.floor(minutos / 1440) * 86_400_000);
  const dd = String(data.getUTCDate()).padStart(2, "0");
  const mm = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm} ${formatarHorario(minutos)}`;
}

function contagemVazia(): Record<TipoAlerta, number> {
  return { jornada_curta: 0, excesso: 0, interjornada: 0, he: 0, troca: 0, ocorrencia: 0 };
}

// Pausas entre os trechos realizados do dia; com limitarJanela, só o que cai nas 16h seguintes à
// entrada.
function pausasNaJanela(realizado: TrechoPosicionado[], limitarJanela: boolean): number {
  const limite = limitarJanela ? realizado[0].inicio + JANELA_REMANESCENTE : Infinity;
  let total = 0;
  for (let i = 1; i < realizado.length; i++) {
    const inicio = realizado[i - 1].fim;
    const fim = Math.min(realizado[i].inicio, limite);
    if (fim > inicio) total += fim - inicio;
  }
  return total;
}

export function analisarFrequencia(
  dias: DiaFrequencia[],
  opcoes: { fracionarInterjornada: boolean } = { fracionarInterjornada: false }
): ColaboradorAnalisado[] {
  const porMatricula = new Map<string, { funcao: string; dias: DiaFrequencia[] }>();
  for (const dia of dias) {
    const grupo = porMatricula.get(dia.matricula) ?? { funcao: dia.funcao, dias: [] };
    grupo.dias.push(dia);
    porMatricula.set(dia.matricula, grupo);
  }

  const resultado: ColaboradorAnalisado[] = [];
  for (const [matricula, grupo] of porMatricula) {
    const temEscala = grupo.dias.some((d) => d.programado.length > 0);
    const analisados = grupo.dias
      .map((d) => analisarDia(d, temEscala))
      .sort((a, b) => diaAbsoluto(a.data) - diaAbsoluto(b.data));

    // Interjornada: da última saída de um dia trabalhado até a primeira entrada do próximo.
    let anterior: { dia: DiaAnalisado; saida: number } | null = null;
    for (const dia of analisados) {
      if (dia.realizado.length === 0) continue;
      const base = diaAbsoluto(dia.data) * 1440;
      const entrada = base + dia.realizado[0].inicio;
      if (anterior) {
        const descanso = entrada - anterior.saida;
        const intervalo = `saída em ${formatarDataHora(anterior.saida)} e entrada em ${formatarDataHora(entrada)}`;
        if (descanso < LIMITE_INTERJORNADA && (!opcoes.fracionarInterjornada || descanso < MINIMO_PRIMEIRO_PERIODO)) {
          dia.alertas.push({
            tipo: "interjornada",
            detalhe: `Descansou ${formatarDuracao(descanso)} (mínimo ${
              opcoes.fracionarInterjornada ? "8:00 seguidas no fracionamento" : "11:00"
            }): ${intervalo}.`,
          });
        } else if (descanso < LIMITE_INTERJORNADA) {
          // Por decisão do DP, a pausa da dupla pegada do dia anterior também completa as 11h
          // (ex.: pausa na sexta + descanso até o sábado, que é trabalhado direto).
          const pausas = pausasNaJanela(anterior.dia.realizado, false) + pausasNaJanela(dia.realizado, true);
          if (descanso + pausas < LIMITE_INTERJORNADA) {
            dia.alertas.push({
              tipo: "interjornada",
              detalhe: `Descansou ${formatarDuracao(descanso)} (${intervalo}) e ${
                pausas ? `só ${formatarDuracao(pausas)} de pausa` : "nenhuma pausa"
              } entre os trechos (dia anterior + dia) — faltou ${formatarDuracao(
                LIMITE_INTERJORNADA - descanso - pausas
              )} para completar as 11:00 (fracionamento: 8h seguidas + pausas).`,
            });
          }
        }
      }
      anterior = { dia, saida: base + Math.max(...dia.realizado.map((t) => t.fim)) };
    }

    const contagem = contagemVazia();
    for (const dia of analisados) for (const a of dia.alertas) contagem[a.tipo]++;
    resultado.push({
      matricula,
      funcao: grupo.funcao,
      dias: analisados,
      diasTrabalhados: analisados.filter((d) => d.realizado.length > 0).length,
      minutosRealizados: analisados.reduce((acc, d) => acc + d.minutosRealizados, 0),
      heEntrada: analisados.reduce((acc, d) => acc + d.heEntrada, 0),
      heSaida: analisados.reduce((acc, d) => acc + d.heSaida, 0),
      contagem,
    });
  }
  return resultado.sort((a, b) => a.matricula.localeCompare(b.matricula));
}
