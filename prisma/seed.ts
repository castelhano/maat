import "dotenv/config";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (existingAdmin) {
    console.log(`Já existe um administrador (${existingAdmin.username}). Nada a fazer.`);
    return;
  }

  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "1234";
  const name = process.env.SEED_ADMIN_NAME ?? "Administrador";

  const result = await auth.api.signUpEmail({
    body: { name, email: `${username}@usuarios.local`, username, password },
  });
  await prisma.user.update({ where: { id: result.user.id }, data: { role: "admin" } });

  console.log("Usuário administrador criado:");
  console.log(`  usuário: ${username}`);
  console.log(`  senha:   ${password}`);
  console.log("Troque essa senha após o primeiro acesso.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
