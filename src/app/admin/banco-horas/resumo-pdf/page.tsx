import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { buscarResumoMensal } from "../actions";
import { ImprimirButton } from "../extrato-pdf/imprimir-button";

function fmtHoras(decimal: number): string {
  const neg = decimal < 0;
  const abs = Math.abs(decimal);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${neg ? "-" : ""}${h}h${String(m).padStart(2, "0")}`;
}

function nomeCompetencia(competencia: string): string {
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const [mes, ano] = competencia.split("/");
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

export default async function ResumoPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string; empresaId?: string; departamento?: string; setor?: string }>;
}) {
  await requireAdmin();
  const { competencia, empresaId, departamento, setor } = await searchParams;
  if (!competencia) notFound();

  const { data, error } = await buscarResumoMensal(competencia, { empresaId, departamento, setor });

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="font-mono text-sm text-text-2">{error ?? "Resumo não encontrado."}</p>
      </div>
    );
  }

  const filtrosAtivos = [
    empresaId && data.linhas[0]?.empresa,
    departamento && `depto. ${departamento}`,
    setor && `área ${setor}`,
  ].filter(Boolean);

  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <div className="mb-8 flex items-start justify-between border-b-2 border-neutral-800 pb-5">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">Resumo Mensal — Banco de Horas</p>
          <p className="text-sm text-neutral-500">
            {nomeCompetencia(data.competencia)}
            {filtrosAtivos.length > 0 && ` · ${filtrosAtivos.join(" · ")}`}
          </p>
        </div>
        <p className="text-right text-xs text-neutral-400">Emitido em {emitidoEm}</p>
      </div>

      <div className="mb-8 grid grid-cols-5 gap-3 rounded-md bg-neutral-50 p-5 text-sm print:border print:border-neutral-300">
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Funcionários</p>
          <p className="font-semibold text-neutral-900">{data.linhas.length}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Crédito total</p>
          <p className="font-semibold text-neutral-900">{fmtHoras(data.totais.creditoBruto)}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Débito total</p>
          <p className="font-semibold text-neutral-900">{fmtHoras(data.totais.debitoBruto)}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">A pagar total</p>
          <p className="font-semibold text-neutral-900">{fmtHoras(data.totais.pagoNoMes)}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">50% / Mês Anterior</p>
          <p className="font-semibold text-neutral-900">
            <span className="text-emerald-600">{fmtHoras(data.totais.pagoReferenteCreditoMes)}</span>
            {" / "}
            <span className="text-amber-600">{fmtHoras(data.totais.pagoReferenteSaldoAnterior)}</span>
          </p>
        </div>
      </div>

      <table className="mb-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
            <th className="py-2 pr-2">Matrícula</th>
            <th className="px-2 py-2">Nome</th>
            <th className="px-2 py-2">Empresa</th>
            <th className="px-2 py-2 text-right">Crédito</th>
            <th className="px-2 py-2 text-right">Débito</th>
            <th className="px-2 py-2 text-right">A Pagar</th>
            <th className="py-2 pl-2 text-right">Saldo Final</th>
          </tr>
        </thead>
        <tbody>
          {data.linhas.map((l) => (
            <tr key={l.matricula} className="border-b border-neutral-200">
              <td className="py-2 pr-2 tabular-nums text-neutral-600">{l.matricula}</td>
              <td className="px-2 py-2 font-medium text-neutral-900">
                {l.nome}
                {l.alertaCredito && <span className="ml-1.5 text-[10px] font-normal text-amber-600">⚠ crédito indevido</span>}
              </td>
              <td className="px-2 py-2 text-neutral-600">{l.empresa}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{fmtHoras(l.creditoBruto)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{fmtHoras(l.debitoBruto)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{fmtHoras(l.pagoNoMes)}</td>
              <td
                className={`py-2 pl-2 text-right font-semibold tabular-nums ${
                  l.saldoFinal < 0 ? "text-red-600" : "text-neutral-900"
                }`}
              >
                {fmtHoras(l.saldoFinal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-800 text-[11px] font-medium text-neutral-500 uppercase">
            <td className="pt-2" colSpan={3}>
              Totais
            </td>
            <td className="pt-2 text-right tabular-nums">{fmtHoras(data.totais.creditoBruto)}</td>
            <td className="pt-2 text-right tabular-nums">{fmtHoras(data.totais.debitoBruto)}</td>
            <td className="pt-2 text-right tabular-nums">{fmtHoras(data.totais.pagoNoMes)}</td>
            <td className="pt-2 text-right tabular-nums">
              {fmtHoras(data.totais.saldoPositivo + data.totais.saldoNegativo)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
