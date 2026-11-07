import { prisma } from "@/lib/prisma";
import { escopoEmpresa, requirePermissao } from "@/lib/session";
import { regrasDaEmpresa } from "@/lib/regras-empresa";
import { EmpresasTable } from "./empresas-table";

export default async function EmpresasPage() {
  const user = await requirePermissao("empresas", "consultar");
  const empresasRaw = await prisma.empresa.findMany({
    where: { id: await escopoEmpresa(user) },
    orderBy: { nome: "asc" },
    include: { _count: { select: { funcionarios: true } } },
  });

  // Funcionários ativos/afastados das empresas com cidades (ex.: LOGTRANS), para o ajuste manual
  // da cidade quando a Divisão do ERP estiver errada.
  const comCidades = empresasRaw.filter((e) => regrasDaEmpresa(e).cidades.length > 0).map((e) => e.id);
  const funcionariosCidade =
    comCidades.length > 0
      ? await prisma.funcionario.findMany({
          where: { empresaId: { in: comCidades }, status: { not: "desligado" } },
          select: { id: true, empresaId: true, matricula: true, nome: true, cidade: true },
          orderBy: { matricula: "asc" },
        })
      : [];

  const empresas = empresasRaw.map((e) => ({
    id: e.id,
    codigo: e.codigo,
    nome: e.nome,
    abbr: e.abbr,
    valorCestaBasica: e.valorCestaBasica?.toNumber() ?? null,
    _count: e._count,
    regras: regrasDaEmpresa(e),
    funcionariosCidade: funcionariosCidade.filter((f) => f.empresaId === e.id),
  }));

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Empresas
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          empresas atendidas pelo departamento pessoal
        </p>
      </div>
      <EmpresasTable empresas={empresas} />
    </>
  );
}
