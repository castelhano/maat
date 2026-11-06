-- CreateTable
CREATE TABLE "consignado_importacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "importadoPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "consignado_importacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "consignado_contrato" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importacaoId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "contrato" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "inicioDesconto" TEXT NOT NULL,
    "fimDesconto" TEXT NOT NULL,
    "totalParcelas" INTEGER NOT NULL,
    "valorParcela" DECIMAL NOT NULL,
    "valorEmprestimo" DECIMAL NOT NULL,
    CONSTRAINT "consignado_contrato_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "consignado_importacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "consignado_importacao_empresaId_competencia_key" ON "consignado_importacao"("empresaId", "competencia");

-- CreateIndex
CREATE INDEX "consignado_contrato_importacaoId_idx" ON "consignado_contrato"("importacaoId");
