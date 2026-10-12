import { redirect } from "next/navigation";
import { Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserSemTrocaSenha } from "@/lib/session";
import { AlterarSenhaForm } from "@/app/dashboard/conta/alterar-senha-form";

export default async function TrocarSenhaPage() {
  const user = await requireUserSemTrocaSenha();
  if (!user.trocarSenha) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <div className="flex items-center gap-2.5 font-mono text-[13px] font-bold tracking-[.08em]">
        <span className="flex size-7 items-center justify-center rounded-[5px] bg-primary">
          <Scale className="size-3.5 text-primary-foreground" />
        </span>
        MAAT <span className="font-normal text-primary">DEPTO PESSOAL</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Troque sua senha</CardTitle>
          <CardDescription>
            Por segurança, defina uma nova senha antes de continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlterarSenhaForm username={user.username ?? ""} redirecionarPara="/dashboard" />
        </CardContent>
      </Card>
    </div>
  );
}
