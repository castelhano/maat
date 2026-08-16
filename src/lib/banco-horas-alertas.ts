// Funções/situações que não deveriam acumular crédito (hora extra) no banco de horas — decisão de
// negócio: agentes de portaria A, aprendizes, aux. de borracharia/elétrica, e qualquer funcionário
// que já recebe gratificação (temGratificacao no cadastro) não fazem hora extra.
export const CARGOS_SEM_HORA_EXTRA = ["AG DE PORTARIA A", "APRENDIZ", "AUX BORRACHARIA", "AUX ELETRICA B"];

export function funcaoNaoPodeCredito(cargoNome: string, temGratificacao: boolean): boolean {
  return temGratificacao || CARGOS_SEM_HORA_EXTRA.includes(cargoNome.trim().toUpperCase());
}
