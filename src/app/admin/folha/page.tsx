import { requirePermissao } from "@/lib/session";
import { AnaliseFolhaCentral } from "./analise-central";

export default async function FolhaPage() {
  await requirePermissao("folha", "consultar");

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Análise da Folha</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          conferência dos cálculos da folha de pagamento do ERP — INSS, IR, FGTS, horas, férias e e-consignado
        </p>
      </div>
      <AnaliseFolhaCentral />
    </>
  );
}
