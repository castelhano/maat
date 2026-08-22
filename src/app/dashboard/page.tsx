import { Building2, Briefcase, Users, UploadCloud, HandCoins, UserRoundCog, Clock, CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ProjectCard } from "@/components/project-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  const counts = isAdmin
    ? await Promise.all([
        prisma.funcionario.count(),
        prisma.cargo.count(),
        prisma.empresa.count(),
        prisma.importacao.count(),
        prisma.terceiro.count(),
        prisma.ferias.count({ where: { gozoInicio: null } }),
      ])
    : null;
  const [funcionarios, cargos, empresas, importacoes, terceiros, feriasPendentes] = counts ?? [0, 0, 0, 0, 0, 0];

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

      {isAdmin ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCard
            href="/admin/beneficios"
            icon={HandCoins}
            cor="rose"
            tag="rotina"
            nome="Benefícios"
            descricao="apuração mensal de cesta básica e vale-refeição, com resumos e gráficos exportáveis."
          />
          <ProjectCard
            href="/admin/banco-horas"
            icon={Clock}
            cor="violet"
            tag="rotina"
            nome="Banco de Horas"
            descricao="extrato mensal por colaborador — crédito, débito, saldo anterior, a pagar e saldo atual."
          />
          <ProjectCard
            href="/admin/importar"
            icon={UploadCloud}
            cor="amber"
            tag="rotina"
            nome="Central de Importações"
            descricao={`${importacoes} importação(ões) registrada(s). Folha, situação/vale-refeição, faltas e afastamentos por competência.`}
          />
          <ProjectCard
            href="/admin/ferias"
            icon={CalendarDays}
            cor="green"
            tag="rotina"
            nome="Programação de Férias"
            descricao={`${feriasPendentes} período(s) aguardando programação. Importação do ERP, mês/quinzena, abono e emissão para mural/gestores.`}
          />
          <ProjectCard
            href="/admin/funcionarios"
            icon={Users}
            cor="blue"
            tag="cadastro"
            nome="Funcionários"
            descricao={`${funcionarios} funcionário(s) cadastrado(s). Ficha completa por empresa.`}
          />
          <ProjectCard
            href="/admin/terceiros"
            icon={UserRoundCog}
            cor="blue"
            tag="cadastro"
            nome="Terceiros"
            descricao={`${terceiros} terceiro(s) cadastrado(s), fora da folha do ERP.`}
          />
          <ProjectCard
            href="/admin/cargos"
            icon={Briefcase}
            cor="violet"
            tag="cadastro"
            nome="Cargos"
            descricao={`${cargos} cargo(s) cadastrado(s), organizados por empresa.`}
          />
          <ProjectCard
            href="/admin/empresas"
            icon={Building2}
            cor="teal"
            tag="cadastro"
            nome="Empresas"
            descricao={`${empresas} empresa(s) atendida(s) pelo departamento pessoal.`}
          />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma rotina disponível ainda</CardTitle>
            <CardDescription>
              Fale com um administrador se precisar de acesso a alguma rotina.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}
