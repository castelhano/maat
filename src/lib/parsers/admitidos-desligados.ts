// Dois relatórios do ERP (Folha > Relatórios > Controle de datas > Admitidos/Desligados). O
// formato preferido é o CSV (traz matrícula, nome e função completos, sem corte) — o TXT de
// largura fixa fica como fallback (nome/função truncados, matrícula do desligados não confiável,
// nesse formato o desligamento só vem com mês/ano, sem o dia).
//
// Usado pra: (1) contar quantos "APRENDIZ" foram admitidos/desligados por mês (indicador de
// turnover), (2) no CSV, que traz matrícula confiável, também sincronizar o status "desligado" no
// cadastro de Funcionário, e (3) contar desligados por transferência com ônus (também excluídos do
// turnover) — ver src/app/admin/importar/movimentacao-actions.ts.

// "TRANSFERENCIA ( COM ONUS )" — exige "COM" entre os dois termos pra não pegar "TRANSFERENCIA
// SEM ONUS" (motivo diferente, que ENTRA no turnover normalmente).
export const MOTIVO_TRANSFERENCIA_COM_ONUS = /TRANSFERENCIA.*\bCOM\b.*ONUS/i;

export type EventoLinha = {
  // Só vem preenchido no formato CSV — no TXT de desligados a matrícula sai cortada e não é
  // confiável (repete pra pessoas diferentes), por isso fica null nesse caso.
  matricula: string | null;
  nome: string;
  funcao: string;
  competencia: string; // "mm/yyyy" do evento (admissão, ou desligamento no relatório de desligados)
  // Data completa do evento — só no CSV. No TXT de desligados o relatório não traz o dia.
  dataEvento: Date | null;
  // Coluna Motivo do relatório de desligados (só no CSV) — ex. "TRANSFERENCIA ( COM ONUS )". Null
  // no relatório de admitidos e no formato TXT (não tem essa coluna nesses casos).
  motivo: string | null;
};

export type AdmitidosDesligadosParseResult = {
  empresaCodigo: string;
  tipo: "admitidos" | "desligados";
  linhas: EventoLinha[];
};

const DATA = /(\d{2})\/(\d{2})\/(\d{4})/;

function paraData(dia: string, mes: string, ano: string): Date {
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

// --- Formato CSV -------------------------------------------------------------------------------

function parseLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === ",") {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

// Cada linha do CSV repete o mesmo registro 2-3 vezes lado a lado (layout de impressão em várias
// colunas, achatado pela exportação) — em vez de depender de posição fixa de coluna, localiza o
// primeiro campo que parece matrícula (6 dígitos) e lê os campos a partir dali.
const MATRICULA_CSV = /^\d{6}$/;

function empresaCodigoCsv(campos: string[]): string | null {
  const idx = campos.findIndex((c) => c.trim() === "Empresa:");
  if (idx === -1) return null;
  const valor = (campos[idx + 1] ?? "").trim();
  const m = /^(\d{3})\b/.exec(valor);
  return m ? m[1] : null;
}

function parseCsvAdmitidos(linhas: string[]): EventoLinha[] {
  const resultado: EventoLinha[] = [];
  for (const linha of linhas) {
    const campos = parseLinhaCsv(linha);
    const idx = campos.findIndex((c) => MATRICULA_CSV.test(c.trim()));
    if (idx === -1 || campos.length < idx + 5) continue;
    const matricula = campos[idx].trim();
    const nome = campos[idx + 2].trim();
    const funcao = campos[idx + 3].trim();
    const dataMatch = DATA.exec(campos[idx + 4]);
    if (!nome || !funcao || !dataMatch) continue;
    const [, dia, mes, ano] = dataMatch;
    resultado.push({ matricula, nome, funcao, competencia: `${mes}/${ano}`, dataEvento: paraData(dia, mes, ano), motivo: null });
  }
  return resultado;
}

function parseCsvDesligados(linhas: string[]): EventoLinha[] {
  const resultado: EventoLinha[] = [];
  for (const linha of linhas) {
    const campos = parseLinhaCsv(linha);
    const idx = campos.findIndex((c) => MATRICULA_CSV.test(c.trim()));
    if (idx === -1 || campos.length < idx + 6) continue;
    const matricula = campos[idx].trim();
    const nome = campos[idx + 2].trim();
    const funcao = campos[idx + 3].trim();
    const dataMatch = DATA.exec(campos[idx + 5]); // campos[idx+4] é admissão, +5 é desligamento
    if (!nome || !funcao || !dataMatch) continue;
    const [, dia, mes, ano] = dataMatch;
    const motivo = (campos[idx + 6] ?? "").trim() || null;
    resultado.push({ matricula, nome, funcao, competencia: `${mes}/${ano}`, dataEvento: paraData(dia, mes, ano), motivo });
  }
  return resultado;
}

// --- Formato TXT de largura fixa (fallback) -----------------------------------------------------

// "lstadmitidos": Nome [29,60), Função [60,78), Admissão a partir de 78.
function parseTxtAdmitidos(conteudo: string): EventoLinha[] {
  const linhas: EventoLinha[] = [];
  for (const linha of conteudo.split(/\r?\n/)) {
    if (linha.length < 79) continue;
    const nome = linha.slice(29, 60).trim();
    const funcao = linha.slice(60, 78).trim();
    const dataMatch = DATA.exec(linha.slice(78));
    if (!nome || !funcao || !dataMatch) continue;
    const [, dia, mes, ano] = dataMatch;
    linhas.push({ matricula: null, nome, funcao, competencia: `${mes}/${ano}`, dataEvento: paraData(dia, mes, ano), motivo: null });
  }
  return linhas;
}

// "lstdemitidos": Nome [18,41), Função [41,52), e a partir de 52 vêm as duas datas GRUDADAS sem
// separador ("/mm/aaaa/mm/aaaa", admissão seguida de desligamento, sem o dia) + motivo colado.
const DATAS_DESLIGADOS_TXT = /^\/(\d{2})\/(\d{4})\/(\d{2})\/(\d{4})/;

function parseTxtDesligados(conteudo: string): EventoLinha[] {
  const linhas: EventoLinha[] = [];
  for (const linha of conteudo.split(/\r?\n/)) {
    if (linha.length < 52) continue;
    const resto = linha.slice(52);
    const m = DATAS_DESLIGADOS_TXT.exec(resto);
    if (!m) continue;
    const nome = linha.slice(18, 41).trim();
    const funcao = linha.slice(41, 52).trim();
    if (!nome || !funcao) continue;
    const [, , , mesDeslig, anoDeslig] = m;
    linhas.push({ matricula: null, nome, funcao, competencia: `${mesDeslig}/${anoDeslig}`, dataEvento: null, motivo: null });
  }
  return linhas;
}

export function parseAdmitidosDesligados(conteudo: string): AdmitidosDesligadosParseResult {
  const linhasArquivo = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const ehCsv = (linhasArquivo[0] ?? "").trim().startsWith('"');

  if (ehCsv) {
    const camposCabecalho = parseLinhaCsv(linhasArquivo[0]);
    const empresaCodigo = empresaCodigoCsv(camposCabecalho);
    if (!empresaCodigo) throw new Error("Não encontrei o código da empresa no cabeçalho do relatório.");

    const ehDesligados = camposCabecalho.some((c) => c.trim() === "Desligamento");
    if (ehDesligados) {
      const linhas = parseCsvDesligados(linhasArquivo);
      if (linhas.length === 0) throw new Error("Nenhuma linha de desligamento foi reconhecida no arquivo.");
      return { empresaCodigo, tipo: "desligados", linhas };
    }
    if (camposCabecalho.some((c) => c.trim() === "Admissão")) {
      const linhas = parseCsvAdmitidos(linhasArquivo);
      if (linhas.length === 0) throw new Error("Nenhuma linha de admissão foi reconhecida no arquivo.");
      return { empresaCodigo, tipo: "admitidos", linhas };
    }
    throw new Error("Não reconheci esse CSV como relatório de Admitidos nem de Desligados.");
  }

  const empresaMatch = /Empresa:?\s*(\d{3})\s+\S/.exec(conteudo);
  if (!empresaMatch) throw new Error("Não encontrei o código da empresa no cabeçalho do relatório.");
  const empresaCodigo = empresaMatch[1];

  // O relatório de desligados traz "Motivo" e o fragmento "sligament" (de "Desligamento", cortado
  // pelo layout do cabeçalho) — o de admitidos não tem nenhum dos dois.
  const ehDesligados = /Motivo/i.test(conteudo) && /sligament|desligad/i.test(conteudo);
  if (ehDesligados) {
    const linhas = parseTxtDesligados(conteudo);
    if (linhas.length === 0) throw new Error("Nenhuma linha de desligamento foi reconhecida no arquivo.");
    return { empresaCodigo, tipo: "desligados", linhas };
  }
  if (/admiss/i.test(conteudo)) {
    const linhas = parseTxtAdmitidos(conteudo);
    if (linhas.length === 0) throw new Error("Nenhuma linha de admissão foi reconhecida no arquivo.");
    return { empresaCodigo, tipo: "admitidos", linhas };
  }

  throw new Error("Não reconheci esse arquivo como relatório de Admitidos nem de Desligados.");
}
