import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { carregarApuracao, type ApuracaoItemDTO } from "../actions";
import { ImprimirButton } from "./imprimir-button";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

function nomeCompetencia(competencia: string): string {
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const [mes, ano] = competencia.split("/");
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

export default async function RelatorioPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string; dimensao?: string; empresa?: string; area?: string }>;
}) {
  await requireAdmin();
  const { competencia, dimensao, empresa, area } = await searchParams;

  if (!competencia || (dimensao !== "cesta" && dimensao !== "vr")) notFound();

  const apuracao = await carregarApuracao(competencia);
  if (!apuracao) notFound();

  let itens = apuracao.itens;
  if (empresa) itens = itens.filter((i) => i.empresaNome === empresa);
  if (area) itens = itens.filter((i) => (i.area ?? "Sem área") === area);

  const elegivel = (i: ApuracaoItemDTO) =>
    dimensao === "cesta" ? i.elegivelCestaBasica : i.elegivelVR && i.valorVR > 0;
  const motivo = (i: ApuracaoItemDTO) =>
    dimensao === "cesta"
      ? i.motivoPerdaCesta
      : i.motivoPerdaVR ?? (i.elegivelVR && i.valorVR <= 0 ? "Valor zerado no período" : null);

  const comDireito = itens.filter(elegivel);
  const semDireito = itens.filter((i) => !elegivel(i));
  const terceiros = itens.filter((i) => i.tipo === "terceiro");
  const valorTotal = comDireito.reduce((acc, i) => acc + i.valorVR, 0);

  const motivosMap = new Map<string, number>();
  for (const i of semDireito) {
    const m = motivo(i);
    if (!m) continue;
    motivosMap.set(m, (motivosMap.get(m) ?? 0) + 1);
  }
  const motivos = [...motivosMap.entries()]
    .map(([label, quantidade]) => ({ label, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
  const maxMotivo = Math.max(1, ...motivos.map((m) => m.quantidade));

  const empresaMap = new Map<string, { elegiveis: number; naoElegiveis: number }>();
  for (const i of itens) {
    const atual = empresaMap.get(i.empresaAbbr) ?? { elegiveis: 0, naoElegiveis: 0 };
    if (elegivel(i)) atual.elegiveis++;
    else atual.naoElegiveis++;
    empresaMap.set(i.empresaAbbr, atual);
  }
  const porEmpresa = [...empresaMap.entries()]
    .map(([nome, v]) => ({ nome, ...v, total: v.elegiveis + v.naoElegiveis }))
    .sort((a, b) => b.total - a.total);

  const rotulo = dimensao === "cesta" ? "Cesta Básica" : "Vale-Alimentação";
  const filtrosAtivos = [empresa, area].filter(Boolean);
  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <div className="mb-8 flex items-start justify-between border-b-2 border-neutral-800 pb-5">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">Relatório de Benefícios — {rotulo}</p>
          <p className="text-sm text-neutral-500">
            {nomeCompetencia(competencia)}
            {filtrosAtivos.length > 0 && ` · ${filtrosAtivos.join(" · ")}`}
          </p>
        </div>
        <p className="text-right text-xs text-neutral-400">Emitido em {emitidoEm}</p>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-3 rounded-md bg-neutral-50 p-5 text-sm print:border print:border-neutral-300">
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Total avaliado</p>
          <p className="font-semibold text-neutral-900">{itens.length}</p>
        </div>
        {dimensao === "vr" && (
          <div>
            <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Com direito</p>
            <p className="font-semibold text-neutral-900">{comDireito.length}</p>
          </div>
        )}
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Sem direito</p>
          <p className="font-semibold text-neutral-900">{semDireito.length}</p>
        </div>
        {dimensao === "vr" ? (
          <div>
            <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Valor total</p>
            <p className="font-semibold text-neutral-900">{formatarMoeda(valorTotal)}</p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Terceiros incluídos</p>
            <p className="font-semibold text-neutral-900">{terceiros.length}</p>
          </div>
        )}
        {dimensao === "cesta" && (
          <div>
            <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Com direito</p>
            <p className="font-semibold text-neutral-900">{comDireito.length}</p>
          </div>
        )}
      </div>

      <div className="mb-8">
        <p className="mb-3 text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">
          Motivos de perda — quem não tem direito, por motivo
        </p>
        {motivos.length === 0 ? (
          <p className="rounded-md border border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
            Ninguém perdeu o benefício nesta competência.
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4">
            {motivos.map((m) => (
              <div key={m.label} className="flex items-center gap-3 text-sm">
                <span className="w-[240px] shrink-0 truncate text-neutral-600">{m.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-sm bg-neutral-100">
                  <div
                    className="h-full rounded-sm bg-neutral-800"
                    style={{ width: `${Math.max(4, (m.quantidade / maxMotivo) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-neutral-900">
                  {m.quantidade}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8">
        <p className="mb-3 text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Resumo por empresa</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
              <th className="py-2 pr-2">Empresa</th>
              <th className="px-2 py-2 text-right">Com direito</th>
              <th className="px-2 py-2 text-right">Sem direito</th>
              <th className="py-2 pl-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {porEmpresa.map((e) => (
              <tr key={e.nome} className="border-b border-neutral-200">
                <td className="py-2 pr-2 text-neutral-900">{e.nome}</td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{e.elegiveis}</td>
                <td className="px-2 py-2 text-right tabular-nums text-red-600">{e.naoElegiveis}</td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums text-neutral-900">{e.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-2 break-before-page">
        <p className="mb-3 text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Detalhamento</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
              <th className="py-2 pr-2">Matrícula</th>
              <th className="px-2 py-2">Nome</th>
              <th className="px-2 py-2">Empresa</th>
              <th className="px-2 py-2">Cargo</th>
              <th className="px-2 py-2">Admissão</th>
              <th className="px-2 py-2">Situação</th>
              <th className="px-2 py-2">Motivo</th>
              {dimensao === "vr" && <th className="py-2 pl-2 text-right">Valor</th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((i, idx) => {
              const eleg = elegivel(i);
              const mot = motivo(i);
              return (
                <tr key={`${i.matricula ?? "terceiro"}-${idx}`} className="border-b border-neutral-200">
                  <td className="py-2 pr-2 tabular-nums text-neutral-600">{i.matricula ?? "—"}</td>
                  <td className="px-2 py-2 font-medium text-neutral-900">
                    {i.nome}
                    {i.tipo === "terceiro" && <span className="ml-1.5 text-[10px] font-normal text-neutral-400">terceiro</span>}
                  </td>
                  <td className="px-2 py-2 text-neutral-600">{i.empresaAbbr}</td>
                  <td className="px-2 py-2 text-neutral-600">{i.cargo ?? "—"}</td>
                  <td className="px-2 py-2 text-neutral-600">{formatarData(i.dataAdmissao)}</td>
                  <td className={`px-2 py-2 font-medium ${eleg ? "text-emerald-700" : "text-red-600"}`}>
                    {eleg ? "Com direito" : "Sem direito"}
                  </td>
                  <td className="px-2 py-2 text-neutral-600">{mot ?? "—"}</td>
                  {dimensao === "vr" && (
                    <td className="py-2 pl-2 text-right tabular-nums text-neutral-600">{formatarMoeda(i.valorVR)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-800 text-[11px] font-medium text-neutral-500 uppercase">
              <td className="pt-2" colSpan={dimensao === "vr" ? 7 : 8}>
                Total — {itens.length} avaliado(s), {comDireito.length} com direito
              </td>
              {dimensao === "vr" && <td className="pt-2 text-right tabular-nums">{formatarMoeda(valorTotal)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
