-- CreateTable
CREATE TABLE "folha_pagamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "importadoPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "folha_pagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "folha_pagamento_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folhaId" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "divisao" TEXT NOT NULL,
    "salarioBase" DECIMAL NOT NULL,
    "admissao" TEXT NOT NULL,
    "gozoInicio" TEXT,
    "gozoFim" TEXT,
    "eventos" TEXT NOT NULL,
    CONSTRAINT "folha_pagamento_item_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "folha_pagamento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "folha_pagamento_empresaId_idx" ON "folha_pagamento"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "folha_pagamento_empresaId_competencia_key" ON "folha_pagamento"("empresaId", "competencia");

-- CreateIndex
CREATE INDEX "folha_pagamento_item_folhaId_idx" ON "folha_pagamento_item"("folhaId");

-- CreateIndex
CREATE UNIQUE INDEX "folha_pagamento_item_folhaId_matricula_key" ON "folha_pagamento_item"("folhaId", "matricula");
