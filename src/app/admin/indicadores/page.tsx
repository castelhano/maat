import { requirePermissao } from "@/lib/session";
import { listarEmpresasIndicadores } from "./actions";
import { IndicadoresPainel } from "./indicadores-painel";
import { AcidentesPainel } from "./acidentes-painel";
import { listarEmpresasComCat } from "./acidentes-actions";

export default async function IndicadoresPage() {
  await requirePermissao("indicadores", "consultar");
  const empresas = await listarEmpresasIndicadores();
  const empresasCat = await listarEmpresasComCat();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Indicadores</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          headcount, custo de pessoal, absenteísmo, benefícios e encargos — por área, a partir de jan/2026
        </p>
      </div>
      <IndicadoresPainel empresas={empresas} />

      <div className="flex flex-col gap-1.5 py-1">
        <h2 className="font-mono text-[16px] font-bold tracking-[.08em] text-foreground">Segurança do Trabalho</h2>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">acidentes de trabalho (CAT) — típico x trajeto</p>
      </div>
      <AcidentesPainel empresas={empresasCat} />
    </div>
  );
}
