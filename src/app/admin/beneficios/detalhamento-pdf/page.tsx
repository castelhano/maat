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

export default async function DetalhamentoPdfPage({
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
  const valorTotal = comDireito.reduce((acc, i) => acc + i.valorVR, 0);

  const rotulo = dimensao === "cesta" ? "Cesta Básica" : "Vale-Refeição";
  const filtrosAtivos = [empresa, area].filter(Boolean);
  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <div className="mb-8 flex items-start justify-between border-b-2 border-neutral-800 pb-5">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">Detalhamento — {rotulo}</p>
          <p className="text-sm text-neutral-500">
            {nomeCompetencia(competencia)}
            {filtrosAtivos.length > 0 && ` · ${filtrosAtivos.join(" · ")}`}
          </p>
        </div>
        <p className="text-right text-xs text-neutral-400">Emitido em {emitidoEm}</p>
      </div>

      <div className={`mb-8 grid gap-3 rounded-md bg-neutral-50 p-5 text-sm print:border print:border-neutral-300 ${dimensao === "vr" ? "grid-cols-4" : "grid-cols-3"}`}>
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Total avaliado</p>
          <p className="font-semibold text-neutral-900">{itens.length}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Com direito</p>
          <p className="font-semibold text-neutral-900">{comDireito.length}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Sem direito</p>
          <p className="font-semibold text-neutral-900">{semDireito.length}</p>
        </div>
        {dimensao === "vr" && (
          <div>
            <p className="text-[10px] tracking-wide text-neutral-400 uppercase">Valor total</p>
            <p className="font-semibold text-neutral-900">{formatarMoeda(valorTotal)}</p>
          </div>
        )}
      </div>

      <table className="mb-2 w-full border-collapse text-sm">
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
                <td className="px-2 py-2 text-neutral-600">{i.empresaNome}</td>
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
  );
}
