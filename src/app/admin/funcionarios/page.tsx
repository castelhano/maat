import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { FuncionariosTable } from "./funcionarios-table";

export default async function FuncionariosPage() {
  await requireAdmin();
  const [funcionarios, empresas, cargos] = await Promise.all([
    prisma.funcionario.findMany({
      orderBy: { nome: "asc" },
      include: { empresa: true, cargo: true },
    }),
    prisma.empresa.findMany({ orderBy: { nome: "asc" } }),
    prisma.cargo.findMany({ orderBy: { nome: "asc" } }),
  ]);

  const funcionariosSerializados = funcionarios.map((f) => ({
    id: f.id,
    empresaId: f.empresaId,
    cargoId: f.cargoId,
    matricula: f.matricula,
    nome: f.nome,
    nomeCompleto: f.nomeCompleto,
    cpf: f.cpf,
    telefone: f.telefone,
    dataAdmissao: f.dataAdmissao.toISOString(),
    salario: f.salario.toNumber(),
    status: f.status as "ativo" | "afastado" | "desligado",
    dataAfastamento: f.dataAfastamento?.toISOString() ?? null,
    dataDesligamento: f.dataDesligamento?.toISOString() ?? null,
    recebeCestaBasica: f.recebeCestaBasica,
    recebeValeRefeicao: f.recebeValeRefeicao,
    valorValeRefeicao: f.valorValeRefeicao?.toNumber() ?? null,
    temGratificacao: f.temGratificacao,
    recebeCestaComoVR: f.recebeCestaComoVR,
    empresa: { nome: f.empresa.nome },
    cargo: {
      nome: f.cargo.nome,
      recebeCestaBasica: f.cargo.recebeCestaBasica,
      recebeValeRefeicao: f.cargo.recebeValeRefeicao,
    },
  }));

  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <h1 className="font-mono text-[22px] font-bold tracking-[.08em] text-foreground">
          Funcionários
        </h1>
        <p className="font-mono text-[11px] tracking-[.06em] text-text-3">
          cadastro de funcionários por empresa
        </p>
      </div>
      <FuncionariosTable
        funcionarios={funcionariosSerializados}
        empresas={empresas}
        cargos={cargos.map((c) => ({
          id: c.id,
          nome: c.nome,
          recebeCestaBasica: c.recebeCestaBasica,
          recebeValeRefeicao: c.recebeValeRefeicao,
        }))}
      />
    </>
  );
}
