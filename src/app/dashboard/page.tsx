import { Building2, Briefcase, Users, UploadCloud, HandCoins, UserRoundCog, Clock, CalendarDays, BarChart3, Calculator } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPermissoes, requireUser } from "@/lib/session";
import type { Modulo } from "@/lib/permissoes";
import { ProjectCard } from "@/components/project-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireUser();
  const permissoes = await getPermissoes(user.id, user.role);
  const pode = (m: Modulo) => permissoes[m] !== undefined;
  const contar = <T,>(m: Modulo, consulta: () => Promise<T>) => (pode(m) ? consulta() : null);

  const [funcionarios, cargos, empresas, importacoes, terceiros, feriasPendentes, indicadores] =
    await Promise.all([
      contar("funcionarios", () => prisma.funcionario.count()),
      contar("cargos", () => prisma.cargo.count()),
      contar("empresas", () => prisma.empresa.count()),
      contar("importar", () => prisma.importacao.count()),
      contar("terceiros", () => prisma.terceiro.count()),
      contar("ferias", () =>
        prisma.ferias
          .findMany({
            where: { gozoInicio: null, funcionario: { status: { not: "desligado" } } },
            select: { funcionario: { select: { cargo: { select: { nome: true } } } } },
          })
          .then(
            (lista) =>
              lista.filter((p) => !p.funcionario.cargo.nome.trim().toUpperCase().includes("APRENDIZ")).length
          )
      ),
      contar("indicadores", () => prisma.indicadorMensal.count()),
    ]);
  const algumaRotina = Object.keys(permissoes).length > 0;

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

      {algumaRotina ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pode("beneficios") && (
            <ProjectCard
              href="/admin/beneficios"
              icon={HandCoins}
              cor="rose"
              tag="rotina"
              nome="Benefícios"
              descricao="apuração mensal de cesta básica e vale-alimentação, com resumos e gráficos exportáveis."
            />
          )}
          {pode("banco-horas") && (
            <ProjectCard
              href="/admin/banco-horas"
              icon={Clock}
              cor="violet"
              tag="rotina"
              nome="Banco de Horas"
              descricao="extrato mensal por colaborador — crédito, débito, saldo anterior, a pagar e saldo atual."
            />
          )}
          {pode("folha") && (
            <ProjectCard
              href="/admin/folha"
              icon={Calculator}
              cor="teal"
              tag="rotina"
              nome="Análise da Folha"
              descricao="importa a folha de pagamento do ERP e confere INSS, IR, FGTS, horas extras, adicional noturno, férias e limite do e-consignado."
            />
          )}
          {pode("indicadores") && (
            <ProjectCard
              href="/admin/indicadores"
              icon={BarChart3}
              cor="rose"
              tag="rotina"
              nome="Indicadores"
              descricao={`${indicadores} registro(s) de indicador mensal. Headcount, custo de pessoal, absenteísmo, benefícios e encargos por área.`}
            />
          )}
          {pode("importar") && (
            <ProjectCard
              href="/admin/importar"
              icon={UploadCloud}
              cor="amber"
              tag="rotina"
              nome="Central de Importações"
              descricao={`${importacoes} importação(ões) registrada(s). Folha, situação/vale-alimentação, faltas e afastamentos por competência.`}
            />
          )}
          {pode("ferias") && (
            <ProjectCard
              href="/admin/ferias"
              icon={CalendarDays}
              cor="green"
              tag="rotina"
              nome="Programação de Férias"
              descricao={`${feriasPendentes} período(s) aguardando programação. Importação do ERP, mês/quinzena, abono e emissão para mural/gestores.`}
            />
          )}
          {pode("funcionarios") && (
            <ProjectCard
              href="/admin/funcionarios"
              icon={Users}
              cor="blue"
              tag="cadastro"
              nome="Funcionários"
              descricao={`${funcionarios} funcionário(s) cadastrado(s). Ficha completa por empresa.`}
            />
          )}
          {pode("terceiros") && (
            <ProjectCard
              href="/admin/terceiros"
              icon={UserRoundCog}
              cor="blue"
              tag="cadastro"
              nome="Terceiros"
              descricao={`${terceiros} terceiro(s) cadastrado(s), fora da folha do ERP.`}
            />
          )}
          {pode("cargos") && (
            <ProjectCard
              href="/admin/cargos"
              icon={Briefcase}
              cor="violet"
              tag="cadastro"
              nome="Cargos"
              descricao={`${cargos} cargo(s) cadastrado(s), organizados por empresa.`}
            />
          )}
          {pode("empresas") && (
            <ProjectCard
              href="/admin/empresas"
              icon={Building2}
              cor="teal"
              tag="cadastro"
              nome="Empresas"
              descricao={`${empresas} empresa(s) atendida(s) pelo departamento pessoal.`}
            />
          )}
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
