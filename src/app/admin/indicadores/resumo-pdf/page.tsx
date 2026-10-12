import { requirePermissao } from "@/lib/session";
import { carregarIndicadores } from "../actions";
import { CAMPOS_INDICADOR, CAMPO_LABEL, labelSetor, calcularDerivados } from "@/lib/indicadores";
import { ImprimirButton } from "../../banco-horas/extrato-pdf/imprimir-button";

function nomeCompetencia(competencia: string): string {
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const [mes, ano] = competencia.split("/");
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

export default async function ResumoIndicadoresPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ empresaId?: string; setor?: string }>;
}) {
  await requirePermissao("indicadores", "consultar");
  const { empresaId, setor } = await searchParams;

  const { linhas } = await carregarIndicadores({ empresaId, setor });
  const dados = linhas.map(calcularDerivados);

  const filtrosAtivos = [empresaId && dados[0]?.empresaNome, setor && `área ${labelSetor(setor)}`].filter(Boolean);
  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto min-h-screen max-w-5xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <div className="mb-8 flex items-start justify-between border-b-2 border-neutral-800 pb-5">
        <div>
          <p className="text-lg font-bold tracking-tight text-neutral-900">Indicadores de RH e Folha</p>
          <p className="text-sm text-neutral-500">
            a partir de jan/2026{filtrosAtivos.length > 0 && ` · ${filtrosAtivos.join(" · ")}`}
          </p>
        </div>
        <p className="text-right text-xs text-neutral-400">Emitido em {emitidoEm}</p>
      </div>

      {dados.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum indicador encontrado para esse filtro.</p>
      ) : (
        <table className="mb-2 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-left text-[10px] tracking-wide text-neutral-500 uppercase">
              <th className="py-2 pr-2">Empresa</th>
              <th className="px-2 py-2">Área</th>
              <th className="px-2 py-2">Competência</th>
              {CAMPOS_INDICADOR.map((c) => (
                <th key={c} className="px-2 py-2 text-right">
                  {CAMPO_LABEL[c]}
                </th>
              ))}
              <th className="px-2 py-2 text-right">IRRF do mês (R$)</th>
              <th className="px-2 py-2 text-right">% Encargos</th>
              <th className="py-2 pl-2 text-right">Rotativ. %</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((l) => (
              <tr key={l.id} className="border-b border-neutral-200">
                <td className="py-2 pr-2 text-neutral-600">{l.empresaNome}</td>
                <td className="px-2 py-2 font-medium text-neutral-900">{labelSetor(l.setor)}</td>
                <td className="px-2 py-2 text-neutral-600">{nomeCompetencia(l.competencia)}</td>
                {CAMPOS_INDICADOR.map((c) => (
                  <td key={c} className="px-2 py-2 text-right tabular-nums text-neutral-600">
                    {l[c].toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums text-neutral-600">
                  {l.irrf.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{l.percentualEncargos.toFixed(1)}%</td>
                <td className="py-2 pl-2 text-right tabular-nums text-neutral-600">{l.taxaRotatividade.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
