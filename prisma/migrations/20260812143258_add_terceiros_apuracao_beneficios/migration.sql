-- AlterTable
ALTER TABLE "empresa" ADD COLUMN "valorCestaBasica" DECIMAL;

-- CreateTable
CREATE TABLE "terceiro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "recebeCestaBasica" BOOLEAN NOT NULL DEFAULT true,
    "recebeValeRefeicao" BOOLEAN NOT NULL DEFAULT false,
    "valorValeRefeicao" DECIMAL,
    "recebeCestaComoVR" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "terceiro_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "apuracao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "geradoPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "apuracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "apuracao_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apuracaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "matricula" TEXT,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "salario" DECIMAL,
    "elegivelCestaBasica" BOOLEAN NOT NULL,
    "motivoPerdaCesta" TEXT,
    "recebeCestaComoVR" BOOLEAN NOT NULL DEFAULT false,
    "valorCestaConvertida" DECIMAL,
    "elegivelVR" BOOLEAN NOT NULL,
    "motivoPerdaVR" TEXT,
    "baseCalculoVR" DECIMAL,
    "valorVR" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "apuracao_item_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "apuracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "faltasNoMes" INTEGER NOT NULL DEFAULT 0,
    "temGratificacao" BOOLEAN NOT NULL DEFAULT false,
    "recebeCestaComoVR" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "funcionario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "funcionario_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "cargo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_funcionario" ("cargoId", "createdAt", "dataAdmissao", "dataAfastamento", "dataDesligamento", "empresaId", "id", "matricula", "nome", "recebeCestaBasica", "recebeValeRefeicao", "salario", "status", "updatedAt", "valorValeRefeicao") SELECT "cargoId", "createdAt", "dataAdmissao", "dataAfastamento", "dataDesligamento", "empresaId", "id", "matricula", "nome", "recebeCestaBasica", "recebeValeRefeicao", "salario", "status", "updatedAt", "valorValeRefeicao" FROM "funcionario";
DROP TABLE "funcionario";
ALTER TABLE "new_funcionario" RENAME TO "funcionario";
CREATE INDEX "funcionario_cargoId_idx" ON "funcionario"("cargoId");
CREATE UNIQUE INDEX "funcionario_empresaId_matricula_key" ON "funcionario"("empresaId", "matricula");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "terceiro_empresaId_idx" ON "terceiro"("empresaId");

-- CreateIndex
CREATE INDEX "apuracao_empresaId_idx" ON "apuracao"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "apuracao_empresaId_competencia_key" ON "apuracao"("empresaId", "competencia");

-- CreateIndex
CREATE INDEX "apuracao_item_apuracaoId_idx" ON "apuracao_item"("apuracaoId");
