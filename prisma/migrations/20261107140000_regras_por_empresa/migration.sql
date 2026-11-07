-- Regras por empresa (LOGTRANS e futuras empresas que trabalham diferente)
ALTER TABLE "empresa" ADD COLUMN "beneficioPeriodoDiaInicio" INTEGER;
ALTER TABLE "empresa" ADD COLUMN "faltasPerdeBeneficio" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "empresa" ADD COLUMN "valeGasMensal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "empresa" ADD COLUMN "valeGasRegraSuspensao" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "empresa" ADD COLUMN "vaRegra" TEXT NOT NULL DEFAULT 'percentual';
ALTER TABLE "empresa" ADD COLUMN "vaValorFixo" DECIMAL;
ALTER TABLE "empresa" ADD COLUMN "vaValoresPorCargo" TEXT;
ALTER TABLE "empresa" ADD COLUMN "cidades" TEXT;
ALTER TABLE "empresa" ADD COLUMN "bancoHorasModo" TEXT NOT NULL DEFAULT 'calculado';
ALTER TABLE "empresa" ADD COLUMN "feriasCalendario" TEXT NOT NULL DEFAULT 'quinzena';

ALTER TABLE "funcionario" ADD COLUMN "cidade" TEXT;

ALTER TABLE "apuracao_vale_gas_item" ADD COLUMN "cidade" TEXT;
ALTER TABLE "apuracao_vale_gas_item" ADD COLUMN "valor" DECIMAL;

-- Calendário de férias por empresa: as datas já cadastradas viram o calendário "padrao" (quinzenas)
ALTER TABLE "quinzena_periodo" ADD COLUMN "calendario" TEXT NOT NULL DEFAULT 'padrao';
DROP INDEX "quinzena_periodo_ano_mes_quinzena_key";
CREATE UNIQUE INDEX "quinzena_periodo_calendario_ano_mes_quinzena_key" ON "quinzena_periodo"("calendario", "ano", "mes", "quinzena");
