import { prisma } from "@/lib/prisma";
import { requirePermissao } from "@/lib/session";
import { dataPagamentoFerias } from "@/lib/feriados";
import { ImprimirButton } from "./imprimir-button";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function ultimoDiaDoMes(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function formatarData(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default async function CalendarioPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  await requirePermissao("ferias", "consultar");
  const { ano: anoParam } = await searchParams;
  const ano = anoParam ? Number(anoParam) : new Date().getFullYear();

  const quinzenas = await prisma.quinzenaPeriodo.findMany({ where: { ano } });

  const linhas = MESES.map((nome, i) => {
    const mes = i + 1;
    return [1, 2].map((quinzena) => {
      const custom = quinzenas.find((q) => q.mes === mes && q.quinzena === quinzena);
      const dataInicio = custom
        ? custom.dataInicio
        : new Date(Date.UTC(ano, mes - 1, quinzena === 2 ? 16 : 1));
      const dataFim = custom
        ? custom.dataFim
        : new Date(Date.UTC(ano, mes - 1, quinzena === 2 ? ultimoDiaDoMes(ano, mes) : 15));
      return { quinzena, dataInicio, dataFim, dataPagamento: dataPagamentoFerias(dataInicio), custom: !!custom };
    });
  });

  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <div className="mb-8 flex items-start justify-between border-b-2 border-neutral-800 pb-5">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">Calendário de Quinzenas — {ano}</p>
          <p className="text-sm text-neutral-500">
            datas de início/fim de cada quinzena e respectiva data de pagamento
          </p>
        </div>
        <p className="text-right text-xs text-neutral-400">Emitido em {emitidoEm}</p>
      </div>

      <table className="mb-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
            <th className="py-2 pr-2">Mês</th>
            <th className="px-2 py-2">1ª quinzena — gozo</th>
            <th className="px-2 py-2">1ª quinzena — pagamento</th>
            <th className="px-2 py-2">2ª quinzena — gozo</th>
            <th className="px-2 py-2">2ª quinzena — pagamento</th>
          </tr>
        </thead>
        <tbody>
          {MESES.map((nome, i) => {
            const [q1, q2] = linhas[i];
            return (
              <tr key={nome} className="border-b border-neutral-200">
                <td className="py-2 pr-2 font-medium text-neutral-900 capitalize">{nome}</td>
                <td className="px-2 py-2 text-neutral-600">
                  {formatarData(q1.dataInicio)} a {formatarData(q1.dataFim)}
                  {q1.custom && <span className="ml-1 text-[10px] text-neutral-400">(personalizada)</span>}
                </td>
                <td className="px-2 py-2 font-semibold text-neutral-900">{formatarData(q1.dataPagamento)}</td>
                <td className="px-2 py-2 text-neutral-600">
                  {formatarData(q2.dataInicio)} a {formatarData(q2.dataFim)}
                  {q2.custom && <span className="ml-1 text-[10px] text-neutral-400">(personalizada)</span>}
                </td>
                <td className="px-2 py-2 font-semibold text-neutral-900">{formatarData(q2.dataPagamento)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
