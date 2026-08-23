import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { dataPagamentoFerias } from "@/lib/feriados";
import { ImprimirButton } from "./imprimir-button";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatarData(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcularValorAproximado(salario: number, diasGozo: number) {
  return (salario / 30) * diasGozo * 1.333 * 1.2;
}

export default async function ResumoPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; area?: string; mes?: string; ano?: string }>;
}) {
  await requireAdmin();
  const { empresa, area, mes, ano } = await searchParams;

  const [periodos, quinzenas] = await Promise.all([
    prisma.ferias.findMany({
      where: { gozoInicio: { not: null } },
      include: { funcionario: { include: { empresa: true, cargo: true } } },
    }),
    prisma.quinzenaPeriodo.findMany(),
  ]);

  const mesFiltro = mes ? Number(mes) : null;
  const anoFiltro = ano ? Number(ano) : null;

  let linhas = periodos.map((p) => ({
    empresa: p.funcionario.empresa.abbr ?? p.funcionario.empresa.nome,
    setor: p.funcionario.cargo.setor,
    salario: p.funcionario.salario.toNumber(),
    mes: p.mes!,
    ano: p.ano!,
    quinzena: p.quinzena!,
    diasDireito: p.diasDireito,
    diasAbono: p.diasAbono,
  }));

  if (empresa) linhas = linhas.filter((l) => l.empresa === empresa);
  if (area) linhas = linhas.filter((l) => (l.setor ?? "Não classificado") === area);
  if (mesFiltro) linhas = linhas.filter((l) => l.mes === mesFiltro);
  if (anoFiltro) linhas = linhas.filter((l) => l.ano === anoFiltro);

  const mapa = new Map<string, { mes: number; ano: number; quinzena: number; qtd: number; valor: number }>();
  for (const l of linhas) {
    const chave = `${l.ano}-${l.mes}-${l.quinzena}`;
    const atual = mapa.get(chave) ?? { mes: l.mes, ano: l.ano, quinzena: l.quinzena, qtd: 0, valor: 0 };
    atual.qtd++;
    atual.valor += calcularValorAproximado(l.salario, l.diasDireito - l.diasAbono);
    mapa.set(chave, atual);
  }

  const linhasResumo = [...mapa.values()]
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes || a.quinzena - b.quinzena)
    .map((v) => {
      const custom = quinzenas.find((q) => q.ano === v.ano && q.mes === v.mes && q.quinzena === v.quinzena);
      const gozoInicio = custom
        ? custom.dataInicio
        : new Date(Date.UTC(v.ano, v.mes - 1, v.quinzena === 2 ? 16 : 1));
      return { ...v, gozoInicio, dataPagamento: dataPagamentoFerias(gozoInicio) };
    });

  const valorTotal = linhasResumo.reduce((acc, v) => acc + v.valor, 0);
  const filtrosAtivos = [empresa, area, mesFiltro && MESES[mesFiltro - 1], anoFiltro && String(anoFiltro)].filter(
    Boolean
  );
  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <div className="mb-8 flex items-start justify-between border-b-2 border-neutral-800 pb-5">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">
            Resumo de Férias — Por Mês e Quinzena
          </p>
          <p className="text-sm text-neutral-500">
            {linhasResumo.length} grupo(s){filtrosAtivos.length > 0 && ` · ${filtrosAtivos.join(" · ")}`}
          </p>
        </div>
        <p className="text-right text-xs text-neutral-400">Emitido em {emitidoEm}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 rounded-md bg-neutral-50 p-5 text-sm print:border print:border-neutral-300">
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Colaboradores programados</p>
          <p className="font-semibold text-neutral-900">{linhas.length}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Valor total aproximado</p>
          <p className="font-semibold text-neutral-900">{formatarMoeda(valorTotal)}</p>
        </div>
      </div>

      <table className="mb-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
            <th className="py-2 pr-2">Mês</th>
            <th className="px-2 py-2">Quinzena</th>
            <th className="px-2 py-2 text-center">Qtde.</th>
            <th className="px-2 py-2 text-right">Valor aproximado</th>
            <th className="px-2 py-2">Início do gozo</th>
            <th className="px-2 py-2">Data de pagamento</th>
          </tr>
        </thead>
        <tbody>
          {linhasResumo.map((v) => (
            <tr key={`${v.ano}-${v.mes}-${v.quinzena}`} className="border-b border-neutral-200">
              <td className="py-2 pr-2 font-medium text-neutral-900">
                {MESES[v.mes - 1]}/{v.ano}
              </td>
              <td className="px-2 py-2 text-neutral-600">{v.quinzena}ª quinzena</td>
              <td className="px-2 py-2 text-center text-neutral-600">{v.qtd}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{formatarMoeda(v.valor)}</td>
              <td className="px-2 py-2 text-neutral-600">{formatarData(v.gozoInicio)}</td>
              <td className="px-2 py-2 font-semibold text-neutral-900">{formatarData(v.dataPagamento)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-800 text-[11px] font-medium text-neutral-500 uppercase">
            <td className="pt-2" colSpan={3}>
              Total
            </td>
            <td className="pt-2 text-right tabular-nums">{formatarMoeda(valorTotal)}</td>
            <td className="pt-2" colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
