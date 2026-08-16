import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buscarExtratoColaborador } from "../actions";
import { ImprimirButton } from "./imprimir-button";

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

export default async function ExtratoPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ funcionarioId?: string; inicio?: string; fim?: string }>;
}) {
  await requireAdmin();
  const { funcionarioId, inicio, fim } = await searchParams;
  if (!funcionarioId || !inicio || !fim) notFound();

  const [{ data, error }, empresaInfo] = await Promise.all([
    buscarExtratoColaborador(funcionarioId, inicio, fim),
    prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { empresa: { select: { nome: true } }, cargo: { select: { nome: true } } },
    }),
  ]);

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="font-mono text-sm text-text-2">{error ?? "Extrato não encontrado."}</p>
      </div>
    );
  }

  const saldoFinalGeral = data.linhas[data.linhas.length - 1].saldoAtual;
  const totalCredito = data.linhas.reduce((acc, l) => acc + l.creditoBruto, 0);
  const totalDebito = data.linhas.reduce((acc, l) => acc + l.debitoBruto, 0);
  const totalPago = data.linhas.reduce((acc, l) => acc + l.aPagar, 0);
  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <div className="mb-8 flex items-start justify-between border-b-2 border-neutral-800 pb-5">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">
            {empresaInfo?.empresa.nome ?? "Empresa"}
          </p>
          <p className="text-sm text-neutral-500">Extrato do Banco de Horas</p>
        </div>
        <p className="text-right text-xs text-neutral-400">Emitido em {emitidoEm}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 rounded-md bg-neutral-50 p-5 text-sm print:border print:border-neutral-300">
        <div>
          <p className="text-[11px] tracking-wide text-neutral-400 uppercase">Colaborador</p>
          <p className="font-semibold text-neutral-900">{data.funcionario.nome}</p>
        </div>
        <div>
          <p className="text-[11px] tracking-wide text-neutral-400 uppercase">Matrícula</p>
          <p className="font-semibold text-neutral-900">{data.funcionario.matricula}</p>
        </div>
        <div>
          <p className="text-[11px] tracking-wide text-neutral-400 uppercase">Função</p>
          <p className="text-neutral-700">{empresaInfo?.cargo.nome ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] tracking-wide text-neutral-400 uppercase">Período</p>
          <p className="text-neutral-700">
            {nomeCompetencia(data.linhas[0].competencia)} a {nomeCompetencia(data.linhas[data.linhas.length - 1].competencia)}
          </p>
        </div>
      </div>

      <table className="mb-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
            <th className="py-2 pr-2">Mês</th>
            <th className="px-2 py-2 text-right">Saldo Anterior</th>
            <th className="px-2 py-2 text-right">Crédito</th>
            <th className="px-2 py-2 text-right">Débito</th>
            <th className="px-2 py-2 text-right">A Pagar</th>
            <th className="py-2 pl-2 text-right">Saldo Atual</th>
          </tr>
        </thead>
        <tbody>
          {data.linhas.map((l) => (
            <tr key={l.competencia} className="border-b border-neutral-200">
              <td className="py-2 pr-2 font-medium text-neutral-900">{nomeCompetencia(l.competencia)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{fmtHoras(l.saldoAnterior)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{fmtHoras(l.creditoBruto)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{fmtHoras(l.debitoBruto)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{fmtHoras(l.aPagar)}</td>
              <td
                className={`py-2 pl-2 text-right font-semibold tabular-nums ${
                  l.saldoAtual < 0 ? "text-red-600" : "text-neutral-900"
                }`}
              >
                {fmtHoras(l.saldoAtual)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-800 text-[11px] font-medium text-neutral-500 uppercase">
            <td className="pt-2">Totais do período</td>
            <td className="pt-2"></td>
            <td className="pt-2 text-right tabular-nums">{fmtHoras(totalCredito)}</td>
            <td className="pt-2 text-right tabular-nums">{fmtHoras(totalDebito)}</td>
            <td className="pt-2 text-right tabular-nums">{fmtHoras(totalPago)}</td>
            <td className="pt-2"></td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-6 flex items-center justify-between rounded-md border-2 border-neutral-800 px-5 py-4">
        <span className="text-sm font-medium text-neutral-600">Saldo atual do banco de horas</span>
        <span className={`text-2xl font-bold tabular-nums ${saldoFinalGeral < 0 ? "text-red-600" : "text-neutral-900"}`}>
          {fmtHoras(saldoFinalGeral)}
        </span>
      </div>

      <div className="mt-8 space-y-2 text-xs leading-relaxed text-neutral-500">
        <p className="font-semibold text-neutral-600">Como ler este extrato:</p>
        <p>
          <strong>Saldo Anterior</strong> é o saldo acumulado até o fechamento do mês anterior.
          <strong> Crédito</strong> é a hora extra trabalhada no mês; metade dela é paga automaticamente
          na folha (coluna <strong>A Pagar</strong>) e a outra metade entra no banco de horas.
          <strong> Débito</strong> são as horas descontadas do banco no mês (folgas, saídas antecipadas
          etc.). <strong>Saldo Atual</strong> é o total disponível ao final do mês.
        </p>
        <p>
          Quando o saldo que já estava no banco é suficiente pra cobrir o débito do mês sozinho, o
          que sobra dele é pago e só a metade do crédito novo permanece no banco.
        </p>
      </div>
    </div>
  );
}
