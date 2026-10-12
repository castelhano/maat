import { NavBar } from "@/components/nav-bar";
import { PermissoesProvider } from "@/components/permissoes-provider";
import { getPermissoes, requireUser } from "@/lib/session";

// O acesso a cada rotina é conferido na própria página/ação (requirePermissao);
// aqui só se exige login.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const permissoes = await getPermissoes(user.id, user.role);

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar name={user.name} role={user.role} />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-6 pt-7 pb-20">
        <PermissoesProvider permissoes={permissoes}>{children}</PermissoesProvider>
      </main>
    </div>
  );
}
