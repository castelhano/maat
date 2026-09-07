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
    "comissao" DECIMAL NOT NULL DEFAULT 0,
    "folhaSuplementar" DECIMAL NOT NULL DEFAULT 0,
    "faltasDias" DECIMAL NOT NULL,
    "faltasValor" DECIMAL NOT NULL,
    "atestadosDias" DECIMAL NOT NULL,
    "atestadosValor" DECIMAL NOT NULL,
    "inssRetido" DECIMAL NOT NULL,
    "fgts" DECIMAL NOT NULL,
    "irrfFerias" DECIMAL NOT NULL,
    "irrfNormal" DECIMAL NOT NULL,
    "cestaBasica" DECIMAL NOT NULL DEFAULT 0,
    "valeGas" DECIMAL NOT NULL DEFAULT 0,
    "valeAlimentacao" DECIMAL NOT NULL DEFAULT 0,
    "cafeManha" DECIMAL NOT NULL DEFAULT 0,
    "refeitorio" DECIMAL NOT NULL DEFAULT 0,
    "proSaude" DECIMAL NOT NULL DEFAULT 0,
    "camposManuais" TEXT,
    "importadoPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "indicador_mensal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- O custoBeneficios antigo (cesta+alimentação+vale-gás já somados) vira o ponto de partida de
-- cestaBasica só pra não perder o valor de vista — reimporte o PDF da competência pra separar
-- certinho entre os 3 códigos.
INSERT INTO "new_indicador_mensal" ("admitidos", "afastados", "atestadosDias", "atestadosValor", "ativos", "camposManuais", "competencia", "createdAt", "cestaBasica", "desligados", "empresaId", "faltasDias", "faltasValor", "fgts", "folhaBruta", "horaExtra", "horaExtraHoras", "comissao", "folhaSuplementar", "id", "importadoPorId", "inssRetido", "irrfFerias", "irrfNormal", "liquidoPagar", "setor", "updatedAt")
SELECT "admitidos", "afastados", "atestadosDias", "atestadosValor", "ativos", "camposManuais", "competencia", "createdAt", "custoBeneficios", "desligados", "empresaId", "faltasDias", "faltasValor", "fgts", "folhaBruta", "horaExtra", "horaExtraHoras", "comissao", "folhaSuplementar", "id", "importadoPorId", "inssRetido", "irrfFerias", "irrfNormal", "liquidoPagar", "setor", "updatedAt"
FROM "indicador_mensal";
DROP TABLE "indicador_mensal";
ALTER TABLE "new_indicador_mensal" RENAME TO "indicador_mensal";
CREATE INDEX "indicador_mensal_empresaId_competencia_idx" ON "indicador_mensal"("empresaId", "competencia");
CREATE UNIQUE INDEX "indicador_mensal_empresaId_setor_competencia_key" ON "indicador_mensal"("empresaId", "setor", "competencia");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
