// Congelamento de saldo pra funcionário afastado há mais de 30 dias: nenhum crédito é gerado
// nem o saldo anterior é pago enquanto ele não retorna — ver src/lib/banco-horas.ts (campo
// `congelado` de CompetenciaEntrada). Dados de afastamento vêm da importação mensal em
// src/app/admin/importar/afastamentos-actions.ts (campos status/dataAfastamento/dataRetorno).

const DIAS_LIMITE_AFASTAMENTO = 30;

export type FuncionarioAfastamento = {
  status: string;
  dataAfastamento: Date | null;
  dataRetorno: Date | null;
};

function ultimoDiaCompetencia(competencia: string): Date {
  const [mes, ano] = competencia.split("/").map(Number);
  // Dia 0 do mês seguinte = último dia do mês da competência.
  return new Date(Date.UTC(ano, mes, 0));
}

/** true se o funcionário estava afastado há mais de 30 dias no fechamento desta competência. */
export function estaCongeladoNaCompetencia(funcionario: FuncionarioAfastamento, competencia: string): boolean {
  if (funcionario.status !== "afastado" || !funcionario.dataAfastamento) return false;

  const fimCompetencia = ultimoDiaCompetencia(competencia);
  if (funcionario.dataRetorno && funcionario.dataRetorno <= fimCompetencia) return false;

  const diasAfastado = Math.floor(
    (fimCompetencia.getTime() - funcionario.dataAfastamento.getTime()) / (24 * 60 * 60 * 1000)
  );
  return diasAfastado > DIAS_LIMITE_AFASTAMENTO;
}
