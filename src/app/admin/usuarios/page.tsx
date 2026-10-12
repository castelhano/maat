import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { UsersTable } from "./users-table";

export default async function UsuariosPage() {
  const currentUser = await requireAdmin();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      ativo: true,
      trocarSenha: true,
      createdAt: true,
      permissoes: { select: { modulo: true, nivel: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Usuários
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          gerencie quem tem acesso ao sistema e a quais rotinas
        </p>
      </div>
      <UsersTable users={users} currentUserId={currentUser.id} />
    </>
  );
}
