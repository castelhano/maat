import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { CargosTable } from "./cargos-table";

export default async function CargosPage() {
  await requireAdmin();
  const cargos = await prisma.cargo.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { funcionarios: true } } },
  });

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Cargos
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          cargos compartilhados entre empresas (correspondem à &quot;Função&quot; do ERP)
        </p>
      </div>
      <CargosTable cargos={cargos} />
    </>
  );
}
