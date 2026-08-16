-- CreateTable
CREATE TABLE "banco_horas_saldo_inicial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "funcionarioId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "saldoDecimal" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "banco_horas_saldo_inicial_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "banco_horas_apuracao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "funcionarioId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "creditoBruto" DECIMAL NOT NULL,
    "debitoBruto" DECIMAL NOT NULL,
    "creditoLiquido" DECIMAL NOT NULL,
    "pagoNoMes" DECIMAL NOT NULL,
    "saldoPositivo" DECIMAL NOT NULL,
    "saldoNegativo" DECIMAL NOT NULL,
    "saldoFinal" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "banco_horas_apuracao_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "banco_horas_lote_credito" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "funcionarioId" TEXT NOT NULL,
    "competenciaOrigem" TEXT NOT NULL,
    "valorOriginal" DECIMAL NOT NULL,
    "valorConsumido" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "banco_horas_lote_credito_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "banco_horas_importacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "importadoPorId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "periodoInicio" TEXT NOT NULL,
    "periodoFim" TEXT NOT NULL,
    "criados" INTEGER NOT NULL,
    "atualizados" INTEGER NOT NULL,
    "naoEncontrados" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "banco_horas_importacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "banco_horas_saldo_inicial_funcionarioId_key" ON "banco_horas_saldo_inicial"("funcionarioId");

-- CreateIndex
CREATE INDEX "banco_horas_apuracao_funcionarioId_idx" ON "banco_horas_apuracao"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "banco_horas_apuracao_funcionarioId_competencia_key" ON "banco_horas_apuracao"("funcionarioId", "competencia");

-- CreateIndex
CREATE INDEX "banco_horas_lote_credito_funcionarioId_status_idx" ON "banco_horas_lote_credito"("funcionarioId", "status");

-- CreateIndex
CREATE INDEX "banco_horas_importacao_empresaId_idx" ON "banco_horas_importacao"("empresaId");
