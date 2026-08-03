import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Painel
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          rotinas de departamento pessoal
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nenhuma rotina cadastrada ainda</CardTitle>
          <CardDescription>
            As próximas etapas vão adicionar aqui o processamento de arquivos
            do ERP.
          </CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
