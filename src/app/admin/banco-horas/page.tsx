import { requireAdmin } from "@/lib/session";
import { ExtratoCentral } from "./extrato-central";

export default async function BancoHorasPage() {
  await requireAdmin();

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Banco de Horas</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          extrato mensal por colaborador, com período configurável
        </p>
      </div>
      <ExtratoCentral />
    </>
  );
}
