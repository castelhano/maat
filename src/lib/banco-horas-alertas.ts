// Funções/situações que não deveriam acumular crédito (hora extra) no banco de horas — decisão de
// negócio: agentes de portaria A, aprendizes, aux. de borracharia/elétrica, e qualquer funcionário
// que já recebe gratificação (temGratificacao no cadastro) não fazem hora extra.
export const CARGOS_SEM_HORA_EXTRA = ["AG DE PORTARIA A", "APRENDIZ", "AUX BORRACHARIA", "AUX ELETRICA B"];

export function funcaoNaoPodeCredito(cargoNome: string, temGratificacao: boolean): boolean {
  return temGratificacao || CARGOS_SEM_HORA_EXTRA.includes(cargoNome.trim().toUpperCase());
}

// Funções que ficam fora do Banco de Horas: recebem hora extra fixa (motorista escolar = 2h por dia
// trabalhado, paga direto na folha). Não geram apuração na importação e somem das telas e do
// arquivo "A Pagar" — o histórico já gravado continua no banco, só fica oculto.
export const CARGOS_FORA_BANCO_HORAS = ["MOTORISTA ESCOLA"];

export function cargoForaDoBancoDeHoras(cargoNome: string): boolean {
  return CARGOS_FORA_BANCO_HORAS.includes(cargoNome.trim().toUpperCase());
}
