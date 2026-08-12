const SEPARADOR = ";";

function escaparCampoCsv(valor: string | number): string {
  const texto = String(valor);
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
