-- CreateTable
CREATE TABLE "operacao_mensal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "kmRodado" DECIMAL NOT NULL DEFAULT 0,
    "receita" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "operacao_mensal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_empresa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "abbr" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "valorCestaBasica" DECIMAL,
    "beneficioPeriodoDiaInicio" INTEGER,
    "faltasPerdeBeneficio" INTEGER NOT NULL DEFAULT 3,
    "valeGasMensal" BOOLEAN NOT NULL DEFAULT false,
    "valeGasRegraSuspensao" BOOLEAN NOT NULL DEFAULT true,
    "vaRegra" TEXT NOT NULL DEFAULT 'percentual',
    "vaValorFixo" DECIMAL,
    "vaValoresPorCargo" TEXT,
    "vaDiaMantemDesligado" INTEGER NOT NULL DEFAULT 25,
    "cestaDiaMantemDesligado" INTEGER,
    "cidades" TEXT,
    "bancoHorasModo" TEXT NOT NULL DEFAULT 'calculado',
    "feriasCalendario" TEXT NOT NULL DEFAULT 'quinzena',
    "desoneracaoFolha" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_empresa" ("abbr", "bancoHorasModo", "beneficioPeriodoDiaInicio", "cestaDiaMantemDesligado", "cidades", "codigo", "createdAt", "faltasPerdeBeneficio", "feriasCalendario", "id", "nome", "updatedAt", "vaDiaMantemDesligado", "vaRegra", "vaValorFixo", "vaValoresPorCargo", "valeGasMensal", "valeGasRegraSuspensao", "valorCestaBasica") SELECT "abbr", "bancoHorasModo", "beneficioPeriodoDiaInicio", "cestaDiaMantemDesligado", "cidades", "codigo", "createdAt", "faltasPerdeBeneficio", "feriasCalendario", "id", "nome", "updatedAt", "vaDiaMantemDesligado", "vaRegra", "vaValorFixo", "vaValoresPorCargo", "valeGasMensal", "valeGasRegraSuspensao", "valorCestaBasica" FROM "empresa";
DROP TABLE "empresa";
ALTER TABLE "new_empresa" RENAME TO "empresa";
CREATE UNIQUE INDEX "empresa_codigo_key" ON "empresa"("codigo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "operacao_mensal_empresaId_competencia_key" ON "operacao_mensal"("empresaId", "competencia");
