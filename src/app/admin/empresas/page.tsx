import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { EmpresasTable } from "./empresas-table";

export default async function EmpresasPage() {
  await requireAdmin();
  const empresas = await prisma.empresa.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { funcionarios: true } } },
  });

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Empresas
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          empresas atendidas pelo departamento pessoal
        </p>
      </div>
      <EmpresasTable empresas={empresas} />
    </>
  );
}
