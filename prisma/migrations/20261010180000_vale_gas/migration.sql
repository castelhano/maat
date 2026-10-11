-- CreateTable
CREATE TABLE "apuracao_vale_gas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "geradoPorId" TEXT NOT NULL,
    "geradoEm" DATETIME,
    "valorEntrega" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "apuracao_vale_gas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "apuracao_vale_gas_empresaId_idx" ON "apuracao_vale_gas"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "apuracao_vale_gas_empresaId_competencia_key" ON "apuracao_vale_gas"("empresaId", "competencia");

-- CreateTable
CREATE TABLE "apuracao_vale_gas_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apuracaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "funcionarioId" TEXT,
    "terceiroId" TEXT,
    "matricula" TEXT,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "dataAdmissao" DATETIME,
    "elegivel" BOOLEAN NOT NULL,
    "motivoPerda" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "apuracao_vale_gas_item_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "apuracao_vale_gas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "apuracao_vale_gas_item_apuracaoId_idx" ON "apuracao_vale_gas_item"("apuracaoId");

-- CreateIndex
CREATE UNIQUE INDEX "apuracao_vale_gas_item_apuracaoId_funcionarioId_key" ON "apuracao_vale_gas_item"("apuracaoId", "funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "apuracao_vale_gas_item_apuracaoId_terceiroId_key" ON "apuracao_vale_gas_item"("apuracaoId", "terceiroId");
