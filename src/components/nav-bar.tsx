"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function NavBar({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 flex h-[52px] items-center justify-between border-b border-border bg-card px-6 backdrop-blur-sm">
      <div className="flex items-center gap-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 font-mono text-[13px] font-bold tracking-[.08em]"
        >
          <span className="flex size-7 items-center justify-center rounded-[5px] bg-primary">
            <Scale className="size-3.5 text-primary-foreground" />
          </span>
          MAAT <span className="font-normal text-primary">DEPTO PESSOAL</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="font-mono text-[11px] font-medium uppercase tracking-[.06em] text-text-2 hover:text-foreground"
          >
            Dashboard
          </Link>
          {role === "admin" && (
            <Link
              href="/admin/usuarios"
              className="font-mono text-[11px] font-medium uppercase tracking-[.06em] text-text-2 hover:text-foreground"
            >
              Usuários
            </Link>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] tracking-[.04em] text-text-3">
          {name} · {role === "admin" ? "ADMIN" : "USUÁRIO"}
        </span>
        <Button variant="secondary" size="sm" nativeButton={false} render={<Link href="/dashboard/conta" />}>
          Minha conta
        </Button>
        <Button variant="secondary" size="sm" onClick={handleLogout}>
          Sair
        </Button>
      </div>
    </header>
  );
}
