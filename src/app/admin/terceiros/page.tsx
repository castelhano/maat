import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { TerceirosTable } from "./terceiros-table";

export default async function TerceirosPage() {
  await requireAdmin();
  const [terceiros, empresas] = await Promise.all([
    prisma.terceiro.findMany({ orderBy: { nome: "asc" }, include: { empresa: true } }),
    prisma.empresa.findMany({ orderBy: { nome: "asc" } }),
  ]);

  const terceirosSerializados = terceiros.map((t) => ({
    id: t.id,
    empresaId: t.empresaId,
    nome: t.nome,
    documento: t.documento,
    ativo: t.ativo,
    recebeCestaBasica: t.recebeCestaBasica,
    recebeValeRefeicao: t.recebeValeRefeicao,
    valorValeRefeicao: t.valorValeRefeicao?.toNumber() ?? null,
    recebeCestaComoVR: t.recebeCestaComoVR,
    empresa: { nome: t.empresa.nome },
  }));

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Terceiros</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          colaboradores terceirizados que não vêm da folha do ERP, mas recebem benefício
        </p>
      </div>
      <TerceirosTable terceiros={terceirosSerializados} empresas={empresas} />
    </>
  );
}
