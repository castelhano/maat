import { requirePermissao } from "@/lib/session";
import { AnaliseFrequenciaCentral } from "./analise-central";

export default async function FrequenciaPage() {
  await requirePermissao("frequencia", "consultar");

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Análise de Frequência</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          escala programada x realizado — jornada curta, excesso, hora extra, troca de escala e interjornada
        </p>
      </div>
      <AnaliseFrequenciaCentral />
    </>
  );
}
