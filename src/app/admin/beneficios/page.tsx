import { requireAdmin } from "@/lib/session";
import { BeneficiosCentral } from "./beneficios-central";

export default async function BeneficiosPage() {
  await requireAdmin();

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Benefícios</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          apuração mensal de cesta básica e vale-refeição
        </p>
      </div>
      <BeneficiosCentral />
    </>
  );
}
