-- AlterTable
ALTER TABLE "funcionario" ADD COLUMN "recebeValeGas" BOOLEAN;
ALTER TABLE "funcionario" ADD COLUMN "valeGasPecunia" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "terceiro" ADD COLUMN "recebeValeGas" BOOLEAN;
ALTER TABLE "terceiro" ADD COLUMN "valeGasPecunia" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "apuracao_vale_gas_item" ADD COLUMN "pecunia" BOOLEAN NOT NULL DEFAULT false;
