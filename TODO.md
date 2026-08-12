# Nova funcionalidade "Banco de Horas"  
1) Exemplo de arquivo a ser importado  
`/home/rafael/Documentos/maat/5_extratoBanco.TXT`
2) Planilha (excel) usada para controle atual apenas para exemplificação  
 `/home/rafael/Documentos/maat/BH_07_2026.xlsx`

## Regras:
a) 50% das horas de cŕedito do mes corrente devem ser pagas (não entra no banco de horas)
b) horas no banco persistem apenas 30 dias apos fechamento, ou seja, saldo do mes 4 deve ser abatido até o fechamento do mes 5 ou deve ser pago no mes 5
c) saldo negativo pode ser usado no mes seguinte apenas em meses pares (2,4,6-fev-abr-jun), saldo negativo de Fev pode ser usado para abater horas do banco em Mar, mais se ficou com horas negativas em Mar não pode abater saldo de abril
d) horas priorizadas para abatimento devem ser sempre as primeiras a vencer (mes anterior) e so abate do proximo restante
e) importação será feita varias vezes no decorrer do mes, dados do mes sobrescritos e calculo do saldo refeito