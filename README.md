# Maat — Depto Pessoal

Sistema interno de rotinas de departamento pessoal: recebe arquivos do ERP, processa, gera análises e devolve arquivos processados. Primeira etapa: usuários, permissões por rotina e autenticação.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Prisma + SQLite (`better-sqlite3`, arquivo local — sem servidor de banco)
- Better-Auth (e-mail/senha)

## Desenvolvimento

```bash
pnpm install
pnpm db:migrate   # aplica as migrations no prisma/dev.db
pnpm db:seed      # cria o usuário admin inicial (ver credenciais no terminal)
pnpm dev
```

Acesse http://localhost:3000.

Por padrão o admin criado é `admin@maat.local` / `1234`. Para customizar, defina antes do seed:

```bash
SEED_ADMIN_EMAIL=voce@empresa.com SEED_ADMIN_PASSWORD=senha-forte pnpm db:seed
```

## Banco de dados

O banco fica em `prisma/dev.db`, um único arquivo — para backup, basta copiar esse arquivo (com o servidor parado, ou usando `pnpm db:studio` fechado). Ele nunca é versionado no git (ver `.gitignore`).

## Rodando na máquina do usuário (Windows, uso local)

1. Instalar Node.js LTS na máquina.
2. Copiar a pasta do projeto (com `node_modules` já instalado) ou rodar `pnpm install` nela.
3. Rodar uma vez: `pnpm build`, `pnpm db:migrate`, `pnpm db:seed`.
4. Criar um atalho na área de trabalho para `iniciar.bat` — ele sobe o servidor (se não estiver rodando) e abre o sistema em uma janela de navegador sem barra de endereço.

## Estrutura de permissões

- `admin`: acessa todas as rotinas e `/admin/usuarios` (criar/editar/remover usuários, permissões, ativar/desativar, exigir troca de senha).
- `usuario`: começa sem acesso; o admin libera cada rotina em **Permissões**, com um de dois níveis:
  - `consultar`: ver telas e baixar relatórios/PDFs;
  - `operar`: consultar + importar, processar, editar e excluir.

O catálogo de rotinas fica em `src/lib/permissoes.ts` e as permissões na tabela `user_permissao`.
Cada página confere o acesso com `requirePermissao(rotina, "consultar")` e cada ação que grava com
`requirePermissao(rotina, "operar")` (`src/lib/session.ts`). **Toda página ou ação nova em `/admin` precisa
dessa chamada** — o layout só exige login. Na tela, `usePodeOperar(rotina)` esconde os botões de quem só consulta.

Usuário desativado não consegue entrar e tem as sessões abertas encerradas. Com "trocar senha" marcado, o usuário
é levado a `/trocar-senha` antes de usar o sistema.

Todas as ações administrativas (criar/editar/remover usuário, permissões, ativar/desativar, senha) ficam registradas em `AuditLog`.
