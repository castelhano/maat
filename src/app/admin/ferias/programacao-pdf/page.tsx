import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ImprimirButton } from "./imprimir-button";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatarData(d: Date | null) {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

export default async function ProgramacaoPdfPage({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string;
    empresa?: string;
    area?: string;
    departamento?: string;
    mes?: string;
  }>;
}) {
  await requireAdmin();
  const { busca, empresa, area, departamento, mes } = await searchParams;

  const periodos = await prisma.ferias.findMany({
    orderBy: { dataLimite: "asc" },
    include: { funcionario: { include: { empresa: true, cargo: true } } },
  });

  const termo = busca?.trim().toLowerCase() ?? "";
  const mesFiltro = mes ? Number(mes) : null;

  let linhas = periodos.map((p) => ({
    id: p.id,
    matricula: p.funcionario.matricula,
    nome: p.funcionario.nome,
    departamento: p.funcionario.cargo.departamento,
    setor: p.funcionario.cargo.setor,
    empresa: p.funcionario.empresa.abbr ?? p.funcionario.empresa.nome,
    faltas: p.faltas,
    diasDireito: p.diasDireito,
    meses: p.meses,
    dataLimite: p.dataLimite,
    mes: p.mes,
    ano: p.ano,
    quinzena: p.quinzena,
    gozoInicio: p.gozoInicio,
    gozoFim: p.gozoFim,
  }));

  if (termo) {
    linhas = linhas.filter(
      (l) => l.matricula.toLowerCase().includes(termo) || l.nome.toLowerCase().includes(termo)
    );
  }
  if (empresa) linhas = linhas.filter((l) => l.empresa === empresa);
  if (area) linhas = linhas.filter((l) => (l.setor ?? "Não classificado") === area);
  if (departamento) linhas = linhas.filter((l) => (l.departamento ?? "Não classificado") === departamento);
  if (mesFiltro) linhas = linhas.filter((l) => l.mes === mesFiltro);

  const filtrosAtivos = [
    busca && `busca: ${busca}`,
    empresa,
    area,
    departamento,
    mesFiltro && MESES[mesFiltro - 1],
  ].filter(Boolean);
  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto min-h-screen max-w-5xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <div className="mb-8 flex items-start justify-between border-b-2 border-neutral-800 pb-5">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">Programação de Férias</p>
          <p className="text-sm text-neutral-500">
            {linhas.length} período(s){filtrosAtivos.length > 0 && ` · ${filtrosAtivos.join(" · ")}`}
          </p>
        </div>
        <p className="text-right text-xs text-neutral-400">Emitido em {emitidoEm}</p>
      </div>

      <table className="mb-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
            <th className="py-2 pr-2">Matrícula</th>
            <th className="px-2 py-2">Nome</th>
            <th className="px-2 py-2">Departamento</th>
            <th className="px-2 py-2 text-center">Faltas</th>
            <th className="px-2 py-2 text-center">Dias</th>
            <th className="px-2 py-2 text-center">Meses vencido</th>
            <th className="px-2 py-2">Limite</th>
            <th className="px-2 py-2">Mês programado</th>
            <th className="px-2 py-2">Gozo Inicial</th>
            <th className="px-2 py-2">Gozo Final</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b border-neutral-200">
              <td className="py-2 pr-2 tabular-nums text-neutral-600">{l.matricula}</td>
              <td className="px-2 py-2 font-medium text-neutral-900">{l.nome}</td>
              <td className="px-2 py-2 text-neutral-600">{l.departamento ?? "—"}</td>
              <td className="px-2 py-2 text-center text-neutral-600">{l.faltas}</td>
              <td className="px-2 py-2 text-center text-neutral-600">{l.diasDireito}</td>
              <td className={`px-2 py-2 text-center ${l.meses >= 21 ? "font-bold text-red-600" : "text-neutral-600"}`}>
                {l.meses}
              </td>
              <td className="px-2 py-2 text-neutral-600">{formatarData(l.dataLimite)}</td>
              <td className="px-2 py-2 text-neutral-600">
                {l.mes ? `${MESES[l.mes - 1]}/${l.ano} · ${l.quinzena}ª quinz.` : "—"}
              </td>
              <td className="px-2 py-2 text-neutral-600">{formatarData(l.gozoInicio)}</td>
              <td className="px-2 py-2 text-neutral-600">{formatarData(l.gozoFim)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-800 text-[11px] font-medium text-neutral-500 uppercase">
            <td className="pt-2" colSpan={10}>
              Total — {linhas.length} período(s), {linhas.filter((l) => l.gozoInicio).length} programado(s)
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
