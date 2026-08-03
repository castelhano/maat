/*
  Warnings:

  - You are about to drop the column `empresaId` on the `cargo` table. All the data in the column will be lost.
  - You are about to drop the column `ativo` on the `funcionario` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cargo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "recebeCestaBasica" BOOLEAN NOT NULL DEFAULT true,
    "recebeValeRefeicao" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_cargo" ("createdAt", "id", "nome", "updatedAt") SELECT "createdAt", "id", "nome", "updatedAt" FROM "cargo";
DROP TABLE "cargo";
ALTER TABLE "new_cargo" RENAME TO "cargo";
CREATE UNIQUE INDEX "cargo_nome_key" ON "cargo"("nome");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "funcionario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "funcionario_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "cargo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_funcionario" ("cargoId", "createdAt", "dataAdmissao", "empresaId", "id", "matricula", "nome", "salario", "updatedAt") SELECT "cargoId", "createdAt", "dataAdmissao", "empresaId", "id", "matricula", "nome", "salario", "updatedAt" FROM "funcionario";
DROP TABLE "funcionario";
ALTER TABLE "new_funcionario" RENAME TO "funcionario";
CREATE INDEX "funcionario_cargoId_idx" ON "funcionario"("cargoId");
CREATE UNIQUE INDEX "funcionario_empresaId_matricula_key" ON "funcionario"("empresaId", "matricula");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
