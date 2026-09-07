/*
  Warnings:

  - Added the required column `horaExtraHoras` to the `indicador_mensal` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_indicador_mensal" (
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
    "horaExtraHoras" DECIMAL NOT NULL,
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
INSERT INTO "new_indicador_mensal" ("admitidos", "afastados", "ativos", "camposManuais", "competencia", "createdAt", "custoBeneficios", "desligados", "empresaId", "faltasDias", "fgts", "folhaBruta", "horaExtra", "id", "importadoPorId", "inss", "irrf", "liquidoPagar", "setor", "updatedAt") SELECT "admitidos", "afastados", "ativos", "camposManuais", "competencia", "createdAt", "custoBeneficios", "desligados", "empresaId", "faltasDias", "fgts", "folhaBruta", "horaExtra", "id", "importadoPorId", "inss", "irrf", "liquidoPagar", "setor", "updatedAt" FROM "indicador_mensal";
DROP TABLE "indicador_mensal";
ALTER TABLE "new_indicador_mensal" RENAME TO "indicador_mensal";
CREATE INDEX "indicador_mensal_empresaId_competencia_idx" ON "indicador_mensal"("empresaId", "competencia");
CREATE UNIQUE INDEX "indicador_mensal_empresaId_setor_competencia_key" ON "indicador_mensal"("empresaId", "setor", "competencia");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
