const SEPARADOR = ";";

// Excel em pt-BR espera vírgula como separador decimal — escrever o número puro do JS (ponto, e às
// vezes com erro de ponto flutuante de somas repetidas, tipo 18786.059999999998) faz o Excel
// confundir cada ponto com separador de milhar e "explodir" o valor. Números inteiros (contagens
// como Ativos/Admitidos) saem sem casas decimais; os demais são arredondados em 2 casas.
function formatarNumeroCsv(valor: number): string {
  if (!Number.isFinite(valor)) return "0";
  const texto = Number.isInteger(valor) ? String(valor) : valor.toFixed(2);
  return texto.replace(".", ",");
}

function escaparCampoCsv(valor: string | number): string {
  const texto = typeof valor === "number" ? formatarNumeroCsv(valor) : valor;
  if (new RegExp(`["${SEPARADOR}\n]`).test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function paraCsv(headers: string[], linhas: (string | number)[][]): string {
  const todasLinhas = [headers, ...linhas];
  // BOM no início pra Excel (locale pt-BR) reconhecer UTF-8 e o ; como separador.
  return "﻿" + todasLinhas.map((linha) => linha.map(escaparCampoCsv).join(SEPARADOR)).join("\r\n");
}

export function baixarCsv(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${nomeArquivo}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
