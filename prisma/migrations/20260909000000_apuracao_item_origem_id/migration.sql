-- AlterTable
ALTER TABLE "apuracao_item" ADD COLUMN "funcionarioId" TEXT;
ALTER TABLE "apuracao_item" ADD COLUMN "terceiroId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "apuracao_item_apuracaoId_funcionarioId_key" ON "apuracao_item"("apuracaoId", "funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "apuracao_item_apuracaoId_terceiroId_key" ON "apuracao_item"("apuracaoId", "terceiroId");
