import { requireUser } from "@/lib/session";
import { AlterarSenhaForm } from "./alterar-senha-form";

export default async function ContaPage() {
  const user = await requireUser();

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Minha conta
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          gerencie sua senha de acesso
        </p>
      </div>
      <AlterarSenhaForm username={user.username ?? ""} />
    </>
  );
}
