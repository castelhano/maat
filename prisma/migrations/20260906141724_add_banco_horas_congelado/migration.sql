-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_banco_horas_apuracao" (
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
    "congelado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "banco_horas_apuracao_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_banco_horas_apuracao" ("competencia", "createdAt", "creditoBruto", "creditoLiquido", "debitoBruto", "funcionarioId", "id", "pagoNoMes", "saldoFinal", "saldoNegativo", "saldoPositivo", "updatedAt") SELECT "competencia", "createdAt", "creditoBruto", "creditoLiquido", "debitoBruto", "funcionarioId", "id", "pagoNoMes", "saldoFinal", "saldoNegativo", "saldoPositivo", "updatedAt" FROM "banco_horas_apuracao";
DROP TABLE "banco_horas_apuracao";
ALTER TABLE "new_banco_horas_apuracao" RENAME TO "banco_horas_apuracao";
CREATE INDEX "banco_horas_apuracao_funcionarioId_idx" ON "banco_horas_apuracao"("funcionarioId");
CREATE UNIQUE INDEX "banco_horas_apuracao_funcionarioId_competencia_key" ON "banco_horas_apuracao"("funcionarioId", "competencia");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
