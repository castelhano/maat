// Relatórios do ERP costumam vir em Windows-1252/Latin-1; se os bytes não forem UTF-8 válido,
// decode "fatal" estoura e caímos no fallback abaixo.
export async function lerArquivoTexto(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}
