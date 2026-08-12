
-- CreateTable
CREATE TABLE "falta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "funcionarioId" TEXT NOT NULL,
    "data" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "falta_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_funcionario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dataAdmissao" DATETIME NOT NULL,
    "cargoId" TEXT NOT NULL,
    "salario" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "dataAfastamento" DATETIME,
    "dataDesligamento" DATETIME,
    "recebeCestaBasica" BOOLEAN,
    "recebeValeRefeicao" BOOLEAN,
    "valorValeRefeicao" DECIMAL,
    "motivoAfastamento" TEXT,
    "temGratificacao" BOOLEAN NOT NULL DEFAULT false,
    "recebeCestaComoVR" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "funcionario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "funcionario_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "cargo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_funcionario" ("cargoId", "createdAt", "dataAdmissao", "dataAfastamento", "dataDesligamento", "empresaId", "id", "matricula", "motivoAfastamento", "nome", "recebeCestaBasica", "recebeCestaComoVR", "recebeValeRefeicao", "salario", "status", "temGratificacao", "updatedAt", "valorValeRefeicao") SELECT "cargoId", "createdAt", "dataAdmissao", "dataAfastamento", "dataDesligamento", "empresaId", "id", "matricula", "motivoAfastamento", "nome", "recebeCestaBasica", "recebeCestaComoVR", "recebeValeRefeicao", "salario", "status", "temGratificacao", "updatedAt", "valorValeRefeicao" FROM "funcionario";
DROP TABLE "funcionario";
ALTER TABLE "new_funcionario" RENAME TO "funcionario";
CREATE INDEX "funcionario_cargoId_idx" ON "funcionario"("cargoId");
CREATE UNIQUE INDEX "funcionario_empresaId_matricula_key" ON "funcionario"("empresaId", "matricula");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "falta_funcionarioId_idx" ON "falta"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "falta_funcionarioId_data_key" ON "falta"("funcionarioId", "data");

