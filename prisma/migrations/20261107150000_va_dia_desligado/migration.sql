-- Dia a partir do qual o desligado mantém o VA do mês (regra original: 25)
ALTER TABLE "empresa" ADD COLUMN "vaDiaMantemDesligado" INTEGER NOT NULL DEFAULT 25;
