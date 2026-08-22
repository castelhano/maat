-- CreateTable
CREATE TABLE "ferias" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ferias_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ferias_funcionarioId_idx" ON "ferias"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ferias_funcionarioId_periodoAquisitivoFim_key" ON "ferias"("funcionarioId", "periodoAquisitivoFim");
