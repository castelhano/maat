import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Importador } from "./importador";

export default function ImportarFolhaPage() {
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin/funcionarios" />}>
          <ArrowLeft />
          Voltar
        </Button>
      </div>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Sincronizar Funcionários
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          sincroniza cargos e funcionários a partir do relatório de salários do ERP
        </p>
      </div>
      <Importador />
    </>
  );
}
