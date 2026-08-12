import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ImportacaoCentral } from "./central";

export default async function ImportarPage() {
  await requireAdmin();
  const empresas = await prisma.empresa.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
          <ArrowLeft />
          Voltar
        </Button>
      </div>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Central de Importações</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          sincrinização de dados com ERP
        </p>
      </div>
      <ImportacaoCentral empresas={empresas} />
    </>
  );
}
