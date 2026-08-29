-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ferias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "funcionarioId" TEXT NOT NULL,
    "periodoAquisitivoInicio" DATETIME NOT NULL,
    "periodoAquisitivoFim" DATETIME NOT NULL,
    "dataLimite" DATETIME NOT NULL,
    "meses" INTEGER NOT NULL,
    "faltas" INTEGER NOT NULL DEFAULT 0,
    "diasDireito" INTEGER NOT NULL,
    "mes" INTEGER,
    "ano" INTEGER,
    "quinzena" INTEGER,
    "diasAbono" INTEGER NOT NULL DEFAULT 0,
    "abonoTipo" TEXT,
    "gozoInicio" DATETIME,
    "gozoFim" DATETIME,
    "dataPagamento" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "exibirMural" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ferias_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ferias" ("abonoTipo", "ano", "createdAt", "dataLimite", "dataPagamento", "diasAbono", "diasDireito", "faltas", "funcionarioId", "gozoFim", "gozoInicio", "id", "mes", "meses", "periodoAquisitivoFim", "periodoAquisitivoInicio", "quinzena", "status", "updatedAt") SELECT "abonoTipo", "ano", "createdAt", "dataLimite", "dataPagamento", "diasAbono", "diasDireito", "faltas", "funcionarioId", "gozoFim", "gozoInicio", "id", "mes", "meses", "periodoAquisitivoFim", "periodoAquisitivoInicio", "quinzena", "status", "updatedAt" FROM "ferias";
DROP TABLE "ferias";
ALTER TABLE "new_ferias" RENAME TO "ferias";
CREATE INDEX "ferias_funcionarioId_idx" ON "ferias"("funcionarioId");
CREATE UNIQUE INDEX "ferias_funcionarioId_periodoAquisitivoFim_key" ON "ferias"("funcionarioId", "periodoAquisitivoFim");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
