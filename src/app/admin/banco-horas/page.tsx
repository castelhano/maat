import { requireAdmin } from "@/lib/session";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import { ExtratoCentral } from "./extrato-central";
import { ResumoMensal } from "./resumo-mensal";
import { Evolucao } from "./evolucao";

export default async function BancoHorasPage() {
  await requireAdmin();

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">Banco de Horas</h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          extrato por colaborador e resumo mensal, com importação do extrato do ERP
        </p>
      </div>

      <Tabs defaultValue="colaborador">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="colaborador">Extrato por colaborador</TabsTab>
          <TabsTab value="mensal">Resumo do mês</TabsTab>
          <TabsTab value="evolucao">Evolução</TabsTab>
        </TabsList>
        <TabsPanel value="colaborador" className="pt-5">
          <ExtratoCentral />
        </TabsPanel>
        <TabsPanel value="mensal" className="pt-5">
          <ResumoMensal />
        </TabsPanel>
        <TabsPanel value="evolucao" className="pt-5">
          <Evolucao />
        </TabsPanel>
      </Tabs>
    </>
  );
}
