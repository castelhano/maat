import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
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
    },
  },
  plugins: [username({ minUsernameLength: 3 })],
});
