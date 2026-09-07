import { requireAdmin } from "@/lib/session";
import { listarEmpresasIndicadores } from "./actions";
import { IndicadoresPainel } from "./indicadores-painel";

export default async function IndicadoresPage() {
  await requireAdmin();
  const empresas = await listarEmpresasIndicadores();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Indicadores</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          headcount, custo de pessoal, absenteísmo, benefícios e encargos — por área, a partir de jan/2026
        </p>
      </div>
      <IndicadoresPainel empresas={empresas} />
    </div>
  );
}
