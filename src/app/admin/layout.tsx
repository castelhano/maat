import { NavBar } from "@/components/nav-bar";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar name={user.name} role={user.role} />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-6 pt-7 pb-20">
        {children}
      </main>
    </div>
  );
}
