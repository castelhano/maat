import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { FeriasTable } from "./ferias-table";

export default async function FeriasPage() {
  await requireAdmin();

  const [periodos, quinzenas] = await Promise.all([
    prisma.ferias.findMany({
      orderBy: { dataLimite: "asc" },
      include: {
        funcionario: {
          include: { empresa: true, cargo: true },
        },
      },
    }),
    prisma.quinzenaPeriodo.findMany(),
  ]);

  const quinzenasSerializadas = quinzenas.map((q) => ({
    ano: q.ano,
    mes: q.mes,
    quinzena: q.quinzena,
    dataInicio: q.dataInicio.toISOString(),
    dataFim: q.dataFim.toISOString(),
  }));

  const periodosSerializados = periodos.map((p) => ({
    id: p.id,
    matricula: p.funcionario.matricula,
    nome: p.funcionario.nome,
    funcao: p.funcionario.cargo.nome,
    departamento: p.funcionario.cargo.departamento,
    setor: p.funcionario.cargo.setor,
    empresa: p.funcionario.empresa.abbr ?? p.funcionario.empresa.nome,
    salario: p.funcionario.salario.toNumber(),
    periodoAquisitivoInicio: p.periodoAquisitivoInicio.toISOString(),
    periodoAquisitivoFim: p.periodoAquisitivoFim.toISOString(),
    dataLimite: p.dataLimite.toISOString(),
    meses: p.meses,
    faltas: p.faltas,
    diasDireito: p.diasDireito,
    mes: p.mes,
    ano: p.ano,
    quinzena: p.quinzena,
    diasAbono: p.diasAbono,
    abonoTipo: p.abonoTipo as "inicio" | "final" | null,
    gozoInicio: p.gozoInicio?.toISOString() ?? null,
    gozoFim: p.gozoFim?.toISOString() ?? null,
    dataPagamento: p.dataPagamento?.toISOString() ?? null,
    status: p.status as "pendente" | "programado" | "concluido",
    exibirMural: p.exibirMural,
  }));

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1 print:hidden">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Programação de Férias
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          importação do relatório do ERP, programação por colaborador e emissão para mural/gestores
        </p>
      </div>
      <FeriasTable periodos={periodosSerializados} quinzenasIniciais={quinzenasSerializadas} />
    </>
  );
}
