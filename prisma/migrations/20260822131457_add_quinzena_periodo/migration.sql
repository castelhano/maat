-- CreateTable
CREATE TABLE "quinzena_periodo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "quinzena" INTEGER NOT NULL,
    "dataInicio" DATETIME NOT NULL,
    "dataFim" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "quinzena_periodo_ano_mes_quinzena_key" ON "quinzena_periodo"("ano", "mes", "quinzena");
