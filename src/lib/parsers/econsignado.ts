// Arquivo do e-Consignado (Crédito do Trabalhador) baixado do portal do empregador: CSV separado
// por ";" com cabeçalho (ifConcessora.codigo;ifConcessora.descricao;contrato;cpf;...), um contrato
// por linha e a parcela a descontar na competência do arquivo.

export type ContratoConsignado = {
  banco: string;
  contrato: string;
  cpf: string; // só dígitos, 11 posições
  nome: string;
  inicioDesconto: string; // "MM/AAAA"
  fimDesconto: string; // "MM/AAAA"
  totalParcelas: number;
  valorParcela: number;
  valorEmprestimo: number;
};

export type ConsignadoParseResult = {
  competencia: string; // "MM/AAAA"
  razaoSocial: string;
  cnpj: string; // 14 dígitos do estabelecimento
  contratos: ContratoConsignado[];
};

export function ehArquivoConsignado(conteudo: string): boolean {
  return /^﻿?ifConcessora\.codigo;/.test(conteudo.trimStart());
}

export function parseConsignado(conteudo: string): ConsignadoParseResult {
  const linhas = conteudo
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (linhas.length < 2) throw new Error("O arquivo do e-Consignado está vazio.");
  const cabecalho = linhas[0].split(";").map((c) => c.trim());
  const col = (nome: string) => {
    const i = cabecalho.indexOf(nome);
    if (i < 0) throw new Error(`Coluna "${nome}" não encontrada no arquivo do e-Consignado.`);
    return i;
  };
  const c = {
    banco: col("ifConcessora.descricao"),
    contrato: col("contrato"),
    cpf: col("cpf"),
    nome: col("nomeTrabalhador"),
    empregador: col("nomeEmpregador"),
    inicio: col("competenciaInicioDesconto"),
    fim: col("competenciaFimDesconto"),
    total: col("totalParcelas"),
    parcela: col("valorParcela"),
    emprestimo: col("valorEmprestimo"),
    competencia: col("competencia"),
    estabelecimento: col("numeroInscricaoEstabelecimento"),
  };

  const numero = (v: string) => Number(v.replace(",", "."));
  let competencia = "";
  let razaoSocial = "";
  let cnpj = "";
  const contratos: ContratoConsignado[] = [];
  for (const linha of linhas.slice(1)) {
    const v = linha.split(";");
    if (v.length < cabecalho.length) continue;
    competencia ||= v[c.competencia].trim();
    razaoSocial ||= v[c.empregador].trim();
    cnpj ||= v[c.estabelecimento].replace(/\D/g, "").padStart(14, "0");
    contratos.push({
      banco: v[c.banco].trim(),
      contrato: v[c.contrato].trim(),
      cpf: v[c.cpf].replace(/\D/g, "").padStart(11, "0"),
      nome: v[c.nome].trim(),
      inicioDesconto: v[c.inicio].trim(),
      fimDesconto: v[c.fim].trim(),
      totalParcelas: Number(v[c.total]) || 0,
      valorParcela: numero(v[c.parcela]),
      valorEmprestimo: numero(v[c.emprestimo]),
    });
  }
  if (!/^\d{2}\/\d{4}$/.test(competencia)) throw new Error("Não encontrei a competência no arquivo do e-Consignado.");
  if (contratos.length === 0) throw new Error("Nenhum contrato encontrado no arquivo do e-Consignado.");
  if (contratos.some((x) => !Number.isFinite(x.valorParcela))) throw new Error("Há parcelas com valor inválido no arquivo.");
  return { competencia, razaoSocial, cnpj, contratos };
}
