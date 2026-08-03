# Maat — Depto Pessoal

Sistema interno de rotinas de departamento pessoal: recebe arquivos do ERP, processa, gera análises e devolve arquivos processados. Primeira etapa: usuários, permissões (`admin` | `usuario`) e autenticação.

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

Por padrão o admin criado é `admin@maat.local` / `TrocarSenha123`. Para customizar, defina antes do seed:

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

- `usuario`: acessa `/dashboard` e as rotinas do dia a dia.
- `admin`: acessa também `/admin/usuarios` para criar/editar/remover usuários e trocar permissões.

Todas as ações administrativas (criar/editar/remover usuário, trocar permissão) ficam registradas em `AuditLog`.
