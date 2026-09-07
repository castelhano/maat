-- CreateTable
CREATE TABLE "cat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "funcionarioId" TEXT NOT NULL,
    "dataAcidente" DATETIME NOT NULL,
    "dataEmissao" DATETIME NOT NULL,
    "houveAfastamento" BOOLEAN NOT NULL,
    "numeroCat" TEXT,
    "tipoAcidente" TEXT NOT NULL,
    "descricaoAcidente" TEXT NOT NULL,
    "situacaoFuncionario" TEXT NOT NULL,
    "codSetor" TEXT NOT NULL,
    "descSetor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cat_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "cat_funcionarioId_idx" ON "cat"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "cat_funcionarioId_dataAcidente_key" ON "cat"("funcionarioId", "dataAcidente");
