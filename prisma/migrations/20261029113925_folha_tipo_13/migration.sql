-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_folha_pagamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'mensal',
    "simulado" BOOLEAN NOT NULL DEFAULT false,
    "nomeArquivo" TEXT NOT NULL,
    "importadoPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "folha_pagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_folha_pagamento" ("competencia", "createdAt", "empresaId", "id", "importadoPorId", "nomeArquivo", "updatedAt") SELECT "competencia", "createdAt", "empresaId", "id", "importadoPorId", "nomeArquivo", "updatedAt" FROM "folha_pagamento";
DROP TABLE "folha_pagamento";
ALTER TABLE "new_folha_pagamento" RENAME TO "folha_pagamento";
CREATE INDEX "folha_pagamento_empresaId_idx" ON "folha_pagamento"("empresaId");
CREATE UNIQUE INDEX "folha_pagamento_empresaId_competencia_tipo_key" ON "folha_pagamento"("empresaId", "competencia", "tipo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
