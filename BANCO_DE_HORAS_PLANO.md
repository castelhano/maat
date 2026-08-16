# Plano de Migração — Banco de Horas

Status: planejamento, sem dados históricos ainda. Este documento descreve o modelo de dados,
o parser, o motor de cálculo e o plano de migração para a nova funcionalidade.

## 1) Regras de negócio (consolidado)

Fonte confiável do TXT (`5_extratoBanco.TXT`): **apenas** matrícula, competência, crédito e
débito. Todo o resto (saldo anterior, saldo atual, hora paga) é recalculado aqui — o TXT desses
campos é inconsistente e não deve ser usado.

Pipeline por funcionário, a cada competência processada em ordem cronológica:

1. Converter crédito/débito de `HH:MM` para decimal. Arredondamento, quando necessário, sempre
   para cima.
2. `creditoLiquido = arredondaCima(creditoDecimal / 2)` — a outra metade é "paga" automaticamente
   (não entra no banco). Registrar esse valor pago (regra a).
3. Débito consome 100% do saldo positivo disponível, sempre abatendo primeiro o lote de crédito
   mais antigo ainda não vencido (FIFO) — regra d.
4. Um lote de crédito não totalmente consumido até o **fechamento do mês seguinte** ao que foi
   gerado expira: o saldo remanescente daquele lote é marcado como "pago" automaticamente e sai
   do banco (regra b/d). Ex.: crédito de 07/2026 só pode abater débito até o fechamento de
   08/2026; o que sobrar nessa data é pago.
5. Se o débito da competência for maior que o saldo positivo disponível (após consumir todos os
   lotes não vencidos), o excedente vira **saldo negativo agregado** (não é FIFO).
6. Saldo negativo carrega pra competência seguinte com uma regra de paridade (regra c, versão
   prática já usada hoje): ao fechar a competência,
   - se o **novo mês é par** (2,4,6,8,10,12): o saldo negativo anterior é mantido integralmente
     como ponto de partida do novo mês (pode ser abatido por crédito do mês);
   - se o **novo mês é ímpar** (1,3,5,7,9,11): o saldo negativo anterior é zerado (floor em 0)
     antes de aplicar o crédito/débito do mês — na prática, dá até 2 meses de vida a um saldo
     negativo (nasce num mês, atravessa um par, zera no ímpar seguinte).
7. Todas as competências de todos os funcionários são persistidas (histórico completo — este
   processo não é controlado no ERP, então o Maat é a fonte de verdade).
8. Reimportação do mesmo mês (regra e): dados daquela competência são sobrescritos e o saldo é
   recalculado a partir dela em diante (não do zero histórico).

**Marco zero**: janeiro/2026. O saldo anterior (dezembro/2025) será um valor **hardcoded por
funcionário**, inserido manualmente via seed/migração, servindo de saldo de abertura do motor de
cálculo. Dados de jan/2026 até a competência atual serão fornecidos posteriormente para
consolidar o histórico.

## 2) Modelo de dados (Prisma)

Seguindo o padrão já usado em `Apuracao`/`ApuracaoItem` (persistido, snapshot, recalculável por
competência) e `Importacao` (log/auditoria de cada arquivo importado).

```prisma
// Saldo de abertura do Banco de Horas por funcionário, marco zero = dezembro/2025.
// Hardcoded manualmente (seed), serve de ponto de partida do motor de cálculo em jan/2026.
model BancoHorasSaldoInicial {
  id            String      @id @default(cuid())
  funcionarioId String      @unique
  funcionario   Funcionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  competencia   String      // sempre "12/2025"
  saldoDecimal  Decimal     // pode ser negativo
  createdAt     DateTime    @default(now())

  @@map("banco_horas_saldo_inicial")
}

// Um registro por funcionário/competência processada — resultado do motor de cálculo.
// Substituído (não versionado) quando a competência é reimportada, conforme regra (e).
model BancoHorasApuracao {
  id            String      @id @default(cuid())
  funcionarioId String
  funcionario   Funcionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  competencia   String      // "MM/AAAA"

  creditoBruto     Decimal   // vindo do TXT, já em decimal
  debitoBruto      Decimal   // vindo do TXT, já em decimal
  creditoLiquido   Decimal   // 50% do bruto, arredondado pra cima — o que de fato entra no banco
  pagoNoMes        Decimal   // 50% do bruto (regra a) + expirações de lotes antigos (regra d)
  saldoPositivo    Decimal   // soma dos lotes de crédito ainda não vencidos/consumidos, ao fechar
  saldoNegativo    Decimal   // sempre <= 0; valor agregado, sem FIFO
  saldoFinal       Decimal   // saldoPositivo + saldoNegativo — o que aparece no resumo do mês

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([funcionarioId, competencia])
  @@index([funcionarioId])
  @@map("banco_horas_apuracao")
}

// Lotes de crédito individuais (FIFO), para rastrear consumo e vencimento (regra d).
// Um lote nasce na competência de origem e vence no fechamento da competência seguinte.
model BancoHorasLoteCredito {
  id              String      @id @default(cuid())
  funcionarioId   String
  funcionario     Funcionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  competenciaOrigem String    // "MM/AAAA" — mês em que o crédito foi gerado
  valorOriginal   Decimal
  valorConsumido  Decimal     @default(0)
  // "aberto" | "consumido" | "expirado_pago"
  status          String      @default("aberto")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([funcionarioId, status])
  @@map("banco_horas_lote_credito")
}

// Log de importação do extrato, mesmo padrão de `Importacao` — mas tipado à parte porque o
// extrato não tem empresaId no cabeçalho de cada bloco (casa só por matrícula, como faltas).
model BancoHorasImportacao {
  id             String   @id @default(cuid())
  empresaId      String
  empresa        Empresa  @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  importadoPorId String
  nomeArquivo    String
  competencia    String
  criados        Int
  atualizados    Int
  naoEncontrados String?
  createdAt      DateTime @default(now())

  @@index([empresaId])
  @@map("banco_horas_importacao")
}
```

Adicionar em `Funcionario`: relações reversas `bancoHorasSaldoInicial`,
`bancoHorasApuracoes`, `bancoHorasLotes`.
Adicionar em `Empresa`: relação reversa `bancoHorasImportacoes`.

Alternativa mais simples a avaliar: em vez de `BancoHorasLoteCredito` como tabela própria,
guardar os lotes como JSON dentro de `BancoHorasApuracao` (campo `lotesAbertosJson`). Reduz uma
tabela, mas perde capacidade de consulta/índice direta sobre lotes (ex.: "quais lotes vencem
esse mês"). Recomendo manter tabela própria — o relatório de vencimento é um caso de uso
esperado (regra d é o coração da funcionalidade).

## 3) Parser (`src/lib/parsers/banco-horas.ts`)

Seguindo o estilo de `afastamentos.ts` / `faltas.ts`: regex por bloco `Funcionario: MAT/MAT NOME`,
depois linhas de competência dentro do bloco. Extrair **apenas** matrícula, competência, crédito
e débito (colunas 2 e 3 da tabela); ignorar `SALDO ANTER`, `HORA PAGA`, `SALDO ATUAL`, `ORIG`.

```ts
export type BancoHorasLinha = {
  matricula: string;
  competencia: string; // "MM/AAAA"
  creditoDecimal: number;
  debitoDecimal: number;
};
```

Conversão `HH:MM` → decimal: `horas + minutos/60`, sem arredondamento nessa etapa (arredondamento
pra cima entra só depois, no cálculo do `creditoLiquido`, regra 1 do item 1).

## 4) Motor de cálculo (`src/lib/banco-horas.ts`)

Função pura, testável, que recebe:
- saldo inicial (lotes abertos + saldo negativo) no início da competência;
- crédito/débito bruto da competência;
- retorna: novo estado (lotes abertos atualizados, saldo negativo, valores pagos) + o registro de
  `BancoHorasApuracao` daquela competência.

Processa competências em ordem cronológica (nunca fora de ordem), pra cada funcionário
isoladamente. Reimportação de uma competência = recalcular a partir dela (regra e), então o motor
deve ser re-executável de forma determinística a partir de qualquer ponto do histórico, dado o
estado (lotes + saldo negativo) da competência anterior.

## 5) UI / integração admin

- Nova seção em `src/app/admin/` (ex. `banco-horas/`), seguindo o padrão de `beneficios/` e
  `funcionarios/`: página de importação do extrato + tabela de resumo mensal por funcionário
  (saldo final, pago no mês, saldo negativo).
- Tela de detalhe por funcionário: histórico de competências + lotes de crédito com status
  (aberto/consumido/expirado).
- Exportação (regra 2): botão para exportar o resumo do mês em CSV, para futura importação no
  ERP — layout exato do CSV fica em aberto até você validar o formato aceito pelo ERP.

## 6) Passos de execução (quando os dados chegarem)

1. Adicionar os models acima ao `schema.prisma`, gerar migração (`prisma migrate dev`).
2. Implementar parser + testes com o `5_extratoBanco.TXT` de exemplo.
3. Implementar motor de cálculo + testes unitários cobrindo os casos de borda das regras
   (crédito expirando exatamente no fechamento, saldo negativo atravessando par→ímpar, etc.).
4. Seed do marco zero: `BancoHorasSaldoInicial` por funcionário com saldo de 12/2025 (dados que
   você vai fornecer).
5. Processar em lote as competências de 01/2026 até a atual, na ordem, para reconstruir
   `BancoHorasLoteCredito` e `BancoHorasApuracao` de todo o histórico.
6. Construir a UI de importação/resumo/exportação.

## 7) Pontos em aberto

- Layout exato do CSV de exportação para o ERP (regra 2) — a definir quando houver exemplo.
r. arquivo txt com matricula com 6 caracteres, seguido de espaço e seguido com valor com 3 casas de milhar e duas casas decimais. exemplo.
000052 025,00 

- Confirmar se "pago no mês" (regra a + expiração de lotes) precisa aparecer em algum lugar da
  folha de pagamento (`folha-salarios.ts`) ou fica só como registro informativo do Banco de
  Horas.
  r. valor pago no mês deve ser persistido, assim como valor referente a expiração de lotes
