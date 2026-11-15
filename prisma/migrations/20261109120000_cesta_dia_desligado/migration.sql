-- Desligado no mês a partir deste dia ainda recebe a cesta física (null = perde, regra original)
ALTER TABLE "empresa" ADD COLUMN "cestaDiaMantemDesligado" INTEGER;
