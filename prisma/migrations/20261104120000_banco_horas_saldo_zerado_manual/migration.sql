-- AlterTable
ALTER TABLE "banco_horas_apuracao" ADD COLUMN "saldoZeradoManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "banco_horas_apuracao" ADD COLUMN "saldoZeradoMotivo" TEXT;
