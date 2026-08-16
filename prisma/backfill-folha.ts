import "dotenv/config";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { primeiraPalavra } from "../src/lib/utils";
import { parseFolhaSalarios } from "../src/lib/parsers/folha-salarios";

const ARQUIVO = process.argv[2];
if (!ARQUIVO) {
  console.error("Uso: tsx prisma/backfill-folha.ts <caminho-do-arquivo>");
  process.exit(1);
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Nenhum usuário admin encontrado para registrar a importação.");

  const conteudo = readFileSync(ARQUIVO, "utf8");
  const parsed = parseFolhaSalarios(conteudo);

  console.log(`Empresa: ${parsed.empresa.codigo} - ${parsed.empresa.nome}`);
  console.log(`Competência: ${parsed.competencia}`);
  console.log(`Funcionários no arquivo: ${parsed.linhas.length}`);

  const resumo = await prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.upsert({
      where: { codigo: parsed.empresa.codigo },
      create: { codigo: parsed.empresa.codigo, nome: parsed.empresa.nome, abbr: primeiraPalavra(parsed.empresa.nome) },
      update: { nome: parsed.empresa.nome },
    });

    const cargoIdPorNome = new Map<string, string>();
    let criados = 0;
    let atualizados = 0;

    for (const linha of parsed.linhas) {
      let cargoId = cargoIdPorNome.get(linha.funcao);
      if (!cargoId) {
        const cargo = await tx.cargo.upsert({
          where: { nome: linha.funcao },
          create: { nome: linha.funcao },
          update: {},
        });
        cargoId = cargo.id;
        cargoIdPorNome.set(linha.funcao, cargoId);
      }

      const existente = await tx.funcionario.findUnique({
        where: { empresaId_matricula: { empresaId: empresa.id, matricula: linha.matricula } },
      });

      if (existente) {
        await tx.funcionario.update({
          where: { id: existente.id },
          data: { cargoId, salario: linha.salario },
        });
        atualizados++;
      } else {
        await tx.funcionario.create({
          data: {
            empresaId: empresa.id,
            matricula: linha.matricula,
            nome: linha.nome,
            dataAdmissao: linha.dataAdmissao,
            cargoId,
            salario: linha.salario,
            status: "ativo",
          },
        });
        criados++;
      }
    }

    const matriculasNoArquivo = parsed.linhas.map((l) => l.matricula);
    const naoEncontrados = await tx.funcionario.findMany({
      where: { empresaId: empresa.id, status: "ativo", matricula: { notIn: matriculasNoArquivo } },
      select: { matricula: true, nome: true },
    });

    await tx.importacao.create({
      data: {
        empresaId: empresa.id,
        importadoPorId: admin.id,
        nomeArquivo: ARQUIVO,
        competencia: parsed.competencia,
        criados,
        atualizados,
        naoEncontrados: naoEncontrados.length > 0 ? JSON.stringify(naoEncontrados) : null,
      },
    });

    return { criados, atualizados, naoEncontrados: naoEncontrados.length };
  });

  console.log("Resumo:", resumo);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
