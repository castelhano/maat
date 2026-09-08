-- Generaliza pro_saude_total em rateio_total_campo (adiciona coluna "campo"), preservando os
-- dados existentes como campo = 'proSaude'.
CREATE TABLE "new_rateio_total_campo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "rateio_total_campo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_rateio_total_campo" ("id", "empresaId", "competencia", "campo", "valor", "createdAt", "updatedAt")
SELECT "id", "empresaId", "competencia", 'proSaude', "valor", "createdAt", "updatedAt" FROM "pro_saude_total";

DROP TABLE "pro_saude_total";
ALTER TABLE "new_rateio_total_campo" RENAME TO "rateio_total_campo";

CREATE UNIQUE INDEX "rateio_total_campo_empresaId_competencia_campo_key" ON "rateio_total_campo"("empresaId", "competencia", "campo");
