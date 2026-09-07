import { PDFParse } from "pdf-parse";

// Extrai o texto de um PDF a partir dos bytes brutos — usado pelos parsers de relatórios que só
// vêm em PDF (o ERP não exporta um TXT equivalente pra esse relatório).
export async function extrairTextoPdf(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}
