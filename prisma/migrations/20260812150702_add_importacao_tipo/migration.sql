-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_importacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'folha_salarios',
    "importadoPorId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "criados" INTEGER NOT NULL,
    "atualizados" INTEGER NOT NULL,
    "naoEncontrados" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "importacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_importacao" ("atualizados", "competencia", "createdAt", "criados", "empresaId", "id", "importadoPorId", "naoEncontrados", "nomeArquivo") SELECT "atualizados", "competencia", "createdAt", "criados", "empresaId", "id", "importadoPorId", "naoEncontrados", "nomeArquivo" FROM "importacao";
DROP TABLE "importacao";
ALTER TABLE "new_importacao" RENAME TO "importacao";
CREATE INDEX "importacao_empresaId_idx" ON "importacao"("empresaId");
CREATE INDEX "importacao_empresaId_tipo_competencia_idx" ON "importacao"("empresaId", "tipo", "competencia");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
