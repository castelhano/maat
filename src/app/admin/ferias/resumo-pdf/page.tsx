import { prisma } from "@/lib/prisma";
import { escopoEmpresa, requirePermissao } from "@/lib/session";
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
  searchParams: Promise<{
    empresa?: string;
    area?: string;
    mes?: string;
    ano?: string;
    mesInicio?: string;
    mesFim?: string;
  }>;
}) {
  const user = await requirePermissao("ferias", "consultar");
  const escopo = await escopoEmpresa(user);
  const { empresa, area, mes, ano, mesInicio, mesFim } = await searchParams;

  const [periodos, quinzenas] = await Promise.all([
    prisma.ferias.findMany({
      where: { gozoInicio: { not: null }, funcionario: { status: { not: "desligado" }, empresaId: escopo } },
      include: { funcionario: { include: { empresa: true, cargo: true } } },
    }),
    prisma.quinzenaPeriodo.findMany(),
  ]);

  const mesFiltro = mes ? Number(mes) : null;
  const anoFiltro = ano ? Number(ano) : null;
  const mesInicioFiltro = !mesFiltro && mesInicio ? Number(mesInicio) : null;
  const mesFimFiltro = !mesFiltro && mesFim ? Number(mesFim) : null;

  let linhas = periodos.map((p) => ({
    empresa: p.funcionario.empresa.abbr ?? p.funcionario.empresa.nome,
    setor: p.funcionario.cargo.setor,
    salario: p.funcionario.temGratificacao
      ? p.funcionario.salario.toNumber() * 1.4
      : p.funcionario.salario.toNumber(),
    mes: p.mes!,
    ano: p.ano!,
    quinzena: p.quinzena!,
    diasDireito: p.diasDireito,
    diasAbono: p.diasAbono,
    gozoInicio: p.gozoInicio,
    dataPagamento: p.dataPagamento,
    valorReal: p.valorReal?.toNumber() ?? null,
  }));

  if (empresa) linhas = linhas.filter((l) => l.empresa === empresa);
  if (area) linhas = linhas.filter((l) => (l.setor ?? "Não classificado") === area);
  if (mesFiltro) linhas = linhas.filter((l) => l.mes === mesFiltro);
  if (anoFiltro) linhas = linhas.filter((l) => l.ano === anoFiltro);
  if (mesInicioFiltro || mesFimFiltro) {
    const inicio = mesInicioFiltro ?? 1;
    const fim = mesFimFiltro ?? 12;
    linhas = linhas.filter((l) => l.mes >= inicio && l.mes <= fim);
  }

  const mapa = new Map<
    string,
    {
      mes: number;
      ano: number;
      quinzena: number;
      qtd: number;
      valor: number;
      comValorReal: number;
      // Início do gozo e data de pagamento variam por colaborador quando há abono no início do
      // período (empurra a data real de início). Contamos os PARES (início, pagamento) juntos — e
      // não cada um separado — pra não acabar mostrando um início de uma turma com o pagamento de
      // outra.
      pares: Map<string, { count: number; gozoInicio: Date; dataPagamento: Date }>;
    }
  >();
  for (const l of linhas) {
    if (!l.gozoInicio || !l.dataPagamento) continue;
    const chave = `${l.ano}-${l.mes}-${l.quinzena}`;
    const atual =
      mapa.get(chave) ??
      { mes: l.mes, ano: l.ano, quinzena: l.quinzena, qtd: 0, valor: 0, comValorReal: 0, pares: new Map() };
    atual.qtd++;
    atual.valor += l.valorReal ?? calcularValorAproximado(l.salario, l.diasDireito - l.diasAbono);
    if (l.valorReal !== null) atual.comValorReal++;
    const chavePar = `${l.gozoInicio.toISOString()}|${l.dataPagamento.toISOString()}`;
    const par = atual.pares.get(chavePar) ?? { count: 0, gozoInicio: l.gozoInicio, dataPagamento: l.dataPagamento };
    par.count++;
    atual.pares.set(chavePar, par);
    mapa.set(chave, atual);
  }

  const linhasResumo = [...mapa.values()]
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes || a.quinzena - b.quinzena)
    .map((v) => {
      const maisFrequente = [...v.pares.values()].sort((a, b) => b.count - a.count)[0];
      let gozoInicio: Date;
      let dataPagamento: Date;
      if (maisFrequente) {
        gozoInicio = maisFrequente.gozoInicio;
        dataPagamento = maisFrequente.dataPagamento;
      } else {
        const custom = quinzenas.find((q) => q.ano === v.ano && q.mes === v.mes && q.quinzena === v.quinzena);
        gozoInicio = custom ? custom.dataInicio : new Date(Date.UTC(v.ano, v.mes - 1, v.quinzena === 2 ? 16 : 1));
        dataPagamento = dataPagamentoFerias(gozoInicio);
      }
      const { pares: _pares, ...resto } = v;
      return { ...resto, gozoInicio, dataPagamento };
    });

  const valorTotal = linhasResumo.reduce((acc, v) => acc + v.valor, 0);
  const filtrosAtivos = [
    empresa,
    area,
    mesFiltro && MESES[mesFiltro - 1],
    anoFiltro && String(anoFiltro),
    (mesInicioFiltro || mesFimFiltro) &&
      `${MESES[(mesInicioFiltro ?? 1) - 1]} a ${MESES[(mesFimFiltro ?? 12) - 1]}`,
  ].filter(Boolean);
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
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Valor total</p>
          <p className="font-semibold text-neutral-900">{formatarMoeda(valorTotal)}</p>
        </div>
      </div>

      <table className="mb-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
            <th className="py-2 pr-2">Mês</th>
            <th className="px-2 py-2">Quinzena</th>
            <th className="px-2 py-2 text-center">Qtde.</th>
            <th className="px-2 py-2 text-right">Valor</th>
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
              <td className="px-2 py-2 text-right tabular-nums text-neutral-600">
                {formatarMoeda(v.valor)}
                <span className="ml-1 text-[10px] text-neutral-400">
                  ({v.comValorReal} de {v.qtd} real)
                </span>
              </td>
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
