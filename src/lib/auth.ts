import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { username } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  // Aceita o próprio endereço pelo qual o sistema foi aberto (ex.: IP da rede local),
  // além do BETTER_AUTH_URL. Sem isso, o login por outro computador dá "Invalid origin".
  trustedOrigins: (request) => {
    const host = request?.headers.get("host");
    return host ? [`http://${host}`, `https://${host}`] : [];
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 4,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "usuario",
        input: false,
      },
      ativo: {
        type: "boolean",
        defaultValue: true,
        input: false,
      },
      trocarSenha: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Bloqueia o login de usuário desativado.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { ativo: true },
          });
          if (user && !user.ativo) {
            throw new APIError("FORBIDDEN", { message: "Usuário desativado. Fale com um administrador." });
          }
        },
      },
    },
    account: {
      update: {
        // Senha trocada pelo próprio usuário (Minha conta / Trocar senha) libera a troca pendente.
        after: async (account) => {
          if (account.userId && account.password) {
            await prisma.user.update({ where: { id: account.userId }, data: { trocarSenha: false } });
          }
        },
      },
    },
  },
  plugins: [username({ minUsernameLength: 3 })],
});
