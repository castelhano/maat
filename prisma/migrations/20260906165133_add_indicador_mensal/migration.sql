-- CreateTable
CREATE TABLE "indicador_mensal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "ativos" INTEGER NOT NULL,
    "admitidos" INTEGER NOT NULL,
    "desligados" INTEGER NOT NULL,
    "afastados" INTEGER NOT NULL,
    "folhaBruta" DECIMAL NOT NULL,
    "liquidoPagar" DECIMAL NOT NULL,
    "horaExtra" DECIMAL NOT NULL,
    "faltasDias" DECIMAL NOT NULL,
    "inss" DECIMAL NOT NULL,
    "fgts" DECIMAL NOT NULL,
    "irrf" DECIMAL NOT NULL,
    "custoBeneficios" DECIMAL NOT NULL,
    "camposManuais" TEXT,
    "importadoPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "indicador_mensal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "indicador_mensal_empresaId_competencia_idx" ON "indicador_mensal"("empresaId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "indicador_mensal_empresaId_setor_competencia_key" ON "indicador_mensal"("empresaId", "setor", "competencia");
