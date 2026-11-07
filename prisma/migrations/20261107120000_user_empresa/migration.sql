-- CreateTable
CREATE TABLE "user_empresa" (
    "userId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,

    PRIMARY KEY ("userId", "empresaId"),
    CONSTRAINT "user_empresa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_empresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "user_empresa_empresaId_idx" ON "user_empresa"("empresaId");
