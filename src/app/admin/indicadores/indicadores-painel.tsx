"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportCard } from "../beneficios/export-card";
import {
  carregarIndicadores,
  atualizarCampoIndicador,
  type IndicadorLinha,
  type OpcaoEmpresa,
} from "./actions";
import { carregarAbsenteismo, type AbsenteismoMes } from "./absenteismo-actions";
import {
  CAMPOS_INDICADOR,
  CAMPO_LABEL,
  SETORES_INDICADOR,
  labelSetor,
  calcularDerivados,
  chaveCompetencia,
  type CampoIndicador,
  type ComDerivados,
} from "@/lib/indicadores";

const TODOS = "__todos__";

// Mesmas cores já usadas em outras telas do app (teal/azul/âmbar/violeta) — mantém consistência
// visual em vez de introduzir uma paleta nova só pra isso.
const COR_SETOR: Record<string, string> = {
  MANUTENCAO: "#0d9488",
  ADMINISTRACAO: "#3b82f6",
  OPERACAO: "#d97706",
  "OPERACAO MOTORISTA": "#7c3aed",
};
const COR_ADMITIDOS = "#0d9488";
const COR_DESLIGADOS = "#ef4444";
const COR_TURNOVER = "#facc15";
const COR_META = "#1e3a8a";

// Meta da empresa: turnover mensal até 1,5%.
const META_TURNOVER = 1.5;
// Mesma meta de 1,5% vale para o % de absenteísmo mensal.
const META_ABSENTEISMO = 1.5;
const COR_ABSENTEISMO = "#0d9488";
const CORES_MOTIVO = ["#0d9488", "#f97316", "#64748b", "#facc15", "#3b82f6", "#7c3aed", "#ef4444"];

const TOOLTIP_STYLE = {
  background: "#131619",
  border: "1px solid #2a3038",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "#e2e8f0",
};

function nomeCompetencia(competencia: string): string {
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [mes, ano] = competencia.split("/");
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

function fmtMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

type LinhaComDerivados = ComDerivados<IndicadorLinha>;

type PontoPorArea = { competencia: string } & Record<string, string | number>;

// Agrupa por competência, somando `campo` por área — vira o formato que o BarChart espera
// ({ competencia, Manutenção: n, Administrativo: n, ... }).
function pivotPorArea(linhas: LinhaComDerivados[], campo: keyof LinhaComDerivados): PontoPorArea[] {
  const porCompetencia = new Map<string, Record<string, number>>();
  for (const l of linhas) {
    const bucket = porCompetencia.get(l.competencia) ?? {};
    const label = labelSetor(l.setor);
    bucket[label] = (bucket[label] ?? 0) + Number(l[campo]);
    porCompetencia.set(l.competencia, bucket);
  }
  return [...porCompetencia.entries()]
    .sort((a, b) => chaveCompetencia(a[0]) - chaveCompetencia(b[0]))
    .map(([competencia, valores]) => ({ competencia: nomeCompetencia(competencia), ...valores }));
}

// Turnover do mês = (Admitidos + Desligados) / 2 / Total de colaboradores × 100 — sobre os
// totais somados do período/filtro (não a média das % de cada área).
// Aprendiz não entra em NADA desse indicador — nem nas barras de Admitidos/Desligados/Total
// Colab., nem no % de Turnover — por isso já desconta na soma, não só no cálculo do percentual.
function pivotTurnover(linhas: LinhaComDerivados[]) {
  type Bucket = { admitidos: number; desligados: number; ativos: number };
  const vazio = (): Bucket => ({ admitidos: 0, desligados: 0, ativos: 0 });
  const porCompetencia = new Map<string, Bucket>();
  for (const l of linhas) {
    const bucket = porCompetencia.get(l.competencia) ?? vazio();
    bucket.admitidos += l.admitidos - l.aprendizesAdmitidos;
    bucket.desligados += l.desligados - l.aprendizesDesligados;
    bucket.ativos += l.ativos - l.aprendizesAtivos;
    porCompetencia.set(l.competencia, bucket);
  }
  return [...porCompetencia.entries()]
    .sort((a, b) => chaveCompetencia(a[0]) - chaveCompetencia(b[0]))
    .map(([competencia, v]) => ({
      competencia: nomeCompetencia(competencia),
      Admitidos: v.admitidos,
      Desligados: v.desligados,
      "Total Colab.": v.ativos,
      Turnover: v.ativos > 0 ? ((v.admitidos + v.desligados) / 2 / v.ativos) * 100 : 0,
    }));
}

function media(valores: number[]): number {
  return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
}

function AreaBarChart({
  dados,
  areasPresentes,
  formatter,
}: {
  dados: Record<string, string | number>[];
  areasPresentes: string[];
  formatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={dados} margin={{ left: 8, right: 24, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
        <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
        <YAxis tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={56} tickFormatter={formatter} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (formatter ? formatter(Number(v)) : v)} />
        {areasPresentes.map((areaLabel) => {
          const valor = SETORES_INDICADOR.find((s) => s.label === areaLabel)?.valor ?? areaLabel;
          return <Bar key={areaLabel} dataKey={areaLabel} fill={COR_SETOR[valor] ?? "#8fa0b0"} maxBarSize={28} radius={[3, 3, 0, 0]} />;
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Legenda({ itens }: { itens: { cor: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 pb-2">
      {itens.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: i.cor }} />
          <span className="font-mono text-[10px] tracking-[.04em] text-text-2">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

export function IndicadoresPainel({ empresas }: { empresas: OpcaoEmpresa[] }) {
  const [empresaId, setEmpresaId] = useState<string>(TODOS);
  const [setor, setSetor] = useState<string>(TODOS);
  const [linhas, setLinhas] = useState<IndicadorLinha[]>([]);
  const [absenteismoMeses, setAbsenteismoMeses] = useState<AbsenteismoMes[]>([]);
  const [competenciaMotivo, setCompetenciaMotivo] = useState<string | null>(null);
  const [carregando, startCarregando] = useTransition();
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  function carregar(overrides: { empresaId?: string; setor?: string }) {
    const e = overrides.empresaId ?? empresaId;
    const s = overrides.setor ?? setor;
    const filtro = { empresaId: e === TODOS ? undefined : e, setor: s === TODOS ? undefined : s };
    startCarregando(async () => {
      const [result, absenteismo] = await Promise.all([carregarIndicadores(filtro), carregarAbsenteismo(filtro)]);
      setLinhas(result.linhas);
      setAbsenteismoMeses(absenteismo.meses);
      setCompetenciaMotivo((atual) =>
        absenteismo.meses.some((m) => m.competencia === atual) ? atual : (absenteismo.meses.at(-1)?.competencia ?? null)
      );
    });
  }

  useEffect(() => {
    carregar({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEmpresaChange(valor: string) {
    setEmpresaId(valor);
    carregar({ empresaId: valor });
  }

  function handleSetorChange(valor: string) {
    setSetor(valor);
    carregar({ setor: valor });
  }

  const dados = useMemo(() => linhas.map(calcularDerivados), [linhas]);

  const areasPresentes = useMemo(() => [...new Set(dados.map((l) => labelSetor(l.setor)))], [dados]);

  const dadosHeadcount = useMemo(() => pivotPorArea(dados, "ativos"), [dados]);
  const totaisAtivosPorMes = useMemo(
    () =>
      dadosHeadcount.map((d) => ({
        competencia: d.competencia,
        total: areasPresentes.reduce((soma, a) => soma + (Number(d[a]) || 0), 0),
      })),
    [dadosHeadcount, areasPresentes]
  );
  const dadosCusto = useMemo(() => pivotPorArea(dados, "custoTotalEmpregador"), [dados]);
  const dadosTurnover = useMemo(() => pivotTurnover(dados), [dados]);
  const dadosAbsenteismo = useMemo(() => pivotPorArea(dados, "diasAusencia"), [dados]);
  const dadosAbsenteismoPct = useMemo(
    () =>
      absenteismoMeses.map((m) => ({
        competencia: nomeCompetencia(m.competencia),
        Dias: m.totalDias,
        Absenteísmo: m.percentual,
      })),
    [absenteismoMeses]
  );
  const mesMotivo = useMemo(
    () => absenteismoMeses.find((m) => m.competencia === competenciaMotivo) ?? null,
    [absenteismoMeses, competenciaMotivo]
  );
  const dadosMotivo = useMemo(
    () => (mesMotivo ? mesMotivo.porMotivo.map((m) => ({ motivo: m.motivo, dias: m.dias })) : []),
    [mesMotivo]
  );
  const dadosBeneficios = useMemo(() => pivotPorArea(dados, "custoBeneficios"), [dados]);
  const dadosEncargos = useMemo(() => pivotPorArea(dados, "encargos"), [dados]);

  async function handleEditarCampo(id: string, campo: CampoIndicador, valorTexto: string) {
    const valor = Number(valorTexto);
    if (Number.isNaN(valor)) {
      toast.error("Valor inválido.");
      return;
    }
    setSalvandoId(id);
    const result = await atualizarCampoIndicador(id, campo, valor);
    setSalvandoId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  const csvHeaders = [
    "Empresa",
    "Área",
    "Competência",
    ...CAMPOS_INDICADOR.map((c) => CAMPO_LABEL[c]),
    "IRRF do mês (R$)",
    "% Encargos",
    "Rotatividade %",
  ];
  const csvLinhas = dados.map((l) => [
    l.empresaNome,
    labelSetor(l.setor),
    l.competencia,
    ...CAMPOS_INDICADOR.map((c) => l[c]),
    l.irrf,
    l.percentualEncargos.toFixed(1),
    l.taxaRotatividade.toFixed(1),
  ]);

  const queryString = new URLSearchParams({
    ...(empresaId !== TODOS ? { empresaId } : {}),
    ...(setor !== TODOS ? { setor } : {}),
  }).toString();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label>Empresa</Label>
          <Select value={empresaId} onValueChange={(value) => handleEmpresaChange(value as string)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Área</Label>
          <Select value={setor} onValueChange={(value) => handleSetorChange(value as string)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {SETORES_INDICADOR.map((s) => (
                <SelectItem key={s.valor} value={s.valor}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {carregando && <p className="font-mono text-[11px] text-text-3">carregando...</p>}

      {!carregando && dados.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
          <p className="font-mono text-[12px] text-text-2">
            Nenhum indicador encontrado a partir de jan/2026. Importe o Resumo Gerencial na Central de Importações.
          </p>
        </div>
      )}

      {!carregando && dados.length > 0 && (
        <div className="flex flex-col gap-4">
          <ExportCard
            titulo="Turnover — admissões x desligamentos"
            descricao={`(Admitidos + Desligados) / 2 / Total de colaboradores × 100 — meta ${META_TURNOVER.toLocaleString("pt-BR")}%`}
            arquivo="indicadores-turnover"
            csv={{
              headers: ["Competência", "Admitidos", "Desligados", "Total Colab.", "Turnover %"],
              linhas: dadosTurnover.map((d) => [
                d.competencia,
                d.Admitidos,
                d.Desligados,
                d["Total Colab."],
                d.Turnover.toFixed(2),
              ]),
            }}
          >
            <Legenda
              itens={[
                { cor: COR_ADMITIDOS, label: "Admitidos" },
                { cor: COR_DESLIGADOS, label: "Desligados" },
                { cor: COR_TURNOVER, label: "Turnover %" },
                { cor: COR_META, label: `Meta ${META_TURNOVER.toLocaleString("pt-BR")}%` },
              ]}
            />
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={dadosTurnover} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
                <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
                <YAxis yAxisId="qtd" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={40} />
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "#7590a8" }}
                  stroke="#2a3038"
                  width={48}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, nome) => (nome === "Turnover" ? `${Number(v).toFixed(2)}%` : v)} />
                <Bar yAxisId="qtd" dataKey="Admitidos" fill={COR_ADMITIDOS} maxBarSize={28} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="qtd" dataKey="Desligados" fill={COR_DESLIGADOS} maxBarSize={28} radius={[3, 3, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="Turnover" stroke={COR_TURNOVER} strokeWidth={2} dot={{ r: 3 }} />
                <ReferenceLine
                  yAxisId="pct"
                  y={META_TURNOVER}
                  stroke={COR_META}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  label={{ value: `Meta ${META_TURNOVER.toLocaleString("pt-BR")}%`, position: "insideTopRight", fill: COR_META, fontSize: 10 }}
                />
              </ComposedChart>
            </ResponsiveContainer>

            <div data-slot="table-container" className="mt-3 overflow-x-auto pr-14 pl-10">
              <table className="w-full table-fixed border-collapse font-mono text-[10px]">
                <colgroup>
                  <col className="w-20" />
                  {dadosTurnover.map((d) => (
                    <col key={d.competencia} />
                  ))}
                  <col />
                </colgroup>
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-1.5 text-left text-text-3">—</th>
                    {dadosTurnover.map((d) => (
                      <th key={d.competencia} className="px-2 py-1.5 text-right text-text-3">
                        {d.competencia}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-bold text-foreground">Média</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="px-2 py-1.5 text-text-2">Admitidos</td>
                    {dadosTurnover.map((d) => (
                      <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                        {d.Admitidos}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold text-foreground">
                      {media(dadosTurnover.map((d) => d.Admitidos)).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-2 py-1.5 text-text-2">Desligados</td>
                    {dadosTurnover.map((d) => (
                      <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                        {d.Desligados}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold text-foreground">
                      {media(dadosTurnover.map((d) => d.Desligados)).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-2 py-1.5 text-text-2">Total Colab.</td>
                    {dadosTurnover.map((d) => (
                      <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                        {d["Total Colab."]}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold text-foreground">
                      {media(dadosTurnover.map((d) => d["Total Colab."])).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 font-bold text-warning">Turnover</td>
                    {dadosTurnover.map((d) => (
                      <td key={d.competencia} className="px-2 py-1.5 text-right font-bold text-warning">
                        {d.Turnover.toFixed(2)}%
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold text-warning">
                      {media(dadosTurnover.map((d) => d.Turnover)).toFixed(2)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ExportCard>

          <ExportCard
            titulo="Headcount (ativos) por área"
            descricao="colaboradores ativos ao fim de cada competência"
            arquivo="indicadores-headcount"
            pdfHref={`/admin/indicadores/resumo-pdf?${queryString}`}
            csv={{
              headers: ["Competência", ...areasPresentes],
              linhas: dadosHeadcount.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0)]),
            }}
          >
            <Legenda itens={areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" }))} />
            <AreaBarChart dados={dadosHeadcount} areasPresentes={areasPresentes} />

            {totaisAtivosPorMes.length > 0 && (
              <div data-slot="table-container" className="mt-3 overflow-x-auto pr-14 pl-10">
                <table className="w-full table-fixed border-collapse font-mono text-[10px]">
                  <colgroup>
                    <col className="w-24" />
                    {totaisAtivosPorMes.map((d) => (
                      <col key={d.competencia} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-1.5 text-left text-text-3">—</th>
                      {totaisAtivosPorMes.map((d) => (
                        <th key={d.competencia} className="px-2 py-1.5 text-right text-text-3">
                          {d.competencia}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-1.5 font-bold text-foreground">Total ativos</td>
                      {totaisAtivosPorMes.map((d) => (
                        <td key={d.competencia} className="px-2 py-1.5 text-right font-bold text-foreground">
                          {d.total}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </ExportCard>

          <ExportCard
            titulo="Absenteísmo (%) — meta 1,5%"
            descricao="dias de ausência ÷ (ativos × dias úteis do mês) × 100 — dia útil aqui conta sábado, só desconta domingo e feriado nacional; inclui atestado médico, faltas (justificadas e não), suspensão, licença luto e licença casamento"
            arquivo="indicadores-absenteismo-percentual"
            csv={{
              headers: ["Competência", "Dias de ausência", "Absenteísmo %"],
              linhas: dadosAbsenteismoPct.map((d) => [d.competencia, d.Dias, d.Absenteísmo.toFixed(2)]),
            }}
          >
            <Legenda
              itens={[
                { cor: COR_ABSENTEISMO, label: "Absenteísmo %" },
                { cor: COR_META, label: `Meta ${META_ABSENTEISMO.toLocaleString("pt-BR")}%` },
              ]}
            />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dadosAbsenteismoPct} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
                <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
                <YAxis tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={48} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${Number(v).toFixed(2)}%`} />
                <Bar dataKey="Absenteísmo" fill={COR_ABSENTEISMO} maxBarSize={36} radius={[3, 3, 0, 0]} />
                <ReferenceLine
                  y={META_ABSENTEISMO}
                  stroke={COR_META}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  label={{ value: `Meta ${META_ABSENTEISMO.toLocaleString("pt-BR")}%`, position: "insideTopRight", fill: COR_META, fontSize: 10 }}
                />
              </BarChart>
            </ResponsiveContainer>

            {dadosAbsenteismoPct.length > 0 && (
              <div data-slot="table-container" className="mt-3 overflow-x-auto pr-14 pl-10">
                <table className="w-full table-fixed border-collapse font-mono text-[10px]">
                  <colgroup>
                    <col className="w-24" />
                    {dadosAbsenteismoPct.map((d) => (
                      <col key={d.competencia} />
                    ))}
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-1.5 text-left text-text-3">—</th>
                      {dadosAbsenteismoPct.map((d) => (
                        <th key={d.competencia} className="px-2 py-1.5 text-right text-text-3">
                          {d.competencia}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-right font-bold text-foreground">Média</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="px-2 py-1.5 text-text-2">Dias de ausência</td>
                      {dadosAbsenteismoPct.map((d) => (
                        <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                          {d.Dias}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-bold text-foreground">
                        {media(dadosAbsenteismoPct.map((d) => d.Dias)).toFixed(1)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1.5 font-bold text-warning">Absenteísmo</td>
                      {dadosAbsenteismoPct.map((d) => (
                        <td key={d.competencia} className="px-2 py-1.5 text-right font-bold text-warning">
                          {d.Absenteísmo.toFixed(2)}%
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-bold text-warning">
                        {media(dadosAbsenteismoPct.map((d) => d.Absenteísmo)).toFixed(2)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </ExportCard>

          <ExportCard
            titulo="Absenteísmo por motivo"
            descricao="dias de ausência no mês selecionado, por tipo de ocorrência (dados do relatório de faltas)"
            arquivo="indicadores-absenteismo-motivo"
            csv={{
              headers: ["Motivo", "Dias"],
              linhas: dadosMotivo.map((d) => [d.motivo, d.dias]),
            }}
          >
            <div className="mb-3 flex flex-col gap-2">
              <Label>Competência</Label>
              <Select value={competenciaMotivo ?? undefined} onValueChange={(v) => setCompetenciaMotivo(v as string)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {absenteismoMeses.map((m) => (
                    <SelectItem key={m.competencia} value={m.competencia}>
                      {nomeCompetencia(m.competencia)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dadosMotivo.length === 0 ? (
              <p className="font-mono text-[11px] text-text-3">Sem dados de faltas para essa competência.</p>
            ) : (
              <>
                <p className="mb-2 font-mono text-[10px] text-text-3">
                  Total: {mesMotivo?.totalDias} dia(s) de ausência em {nomeCompetencia(mesMotivo?.competencia ?? "")}
                </p>
                <ResponsiveContainer width="100%" height={Math.max(180, dadosMotivo.length * 34)}>
                  <BarChart data={dadosMotivo} layout="vertical" margin={{ left: 8, right: 24, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" />
                    <YAxis
                      type="category"
                      dataKey="motivo"
                      tick={{ fontSize: 10, fill: "#8fa0b0" }}
                      stroke="#2a3038"
                      width={140}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="dias" maxBarSize={22} radius={[0, 3, 3, 0]}>
                      {dadosMotivo.map((_, i) => (
                        <Cell key={i} fill={CORES_MOTIVO[i % CORES_MOTIVO.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </ExportCard>

          <ExportCard
            titulo="Absenteísmo (dias) por área"
            descricao="dias de falta + atestado somados"
            arquivo="indicadores-absenteismo"
            csv={{
              headers: ["Competência", ...areasPresentes],
              linhas: dadosAbsenteismo.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0)]),
            }}
          >
            <Legenda itens={areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" }))} />
            <AreaBarChart dados={dadosAbsenteismo} areasPresentes={areasPresentes} />
          </ExportCard>

          <ExportCard
            titulo="Custo total do empregador por área"
            descricao="folha bruta + FGTS + benefícios (cesta, VR, vale-gás)"
            arquivo="indicadores-custo-total"
            csv={{
              headers: ["Competência", ...areasPresentes],
              linhas: dadosCusto.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0)]),
            }}
          >
            <Legenda itens={areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" }))} />
            <AreaBarChart dados={dadosCusto} areasPresentes={areasPresentes} formatter={fmtMoeda} />
          </ExportCard>

          <ExportCard
            titulo="Custo de benefícios por área"
            descricao="cesta básica + vale-gás + vale-alimentação + café da manhã + refeitório + pró-saúde"
            arquivo="indicadores-beneficios"
            csv={{
              headers: ["Competência", ...areasPresentes],
              linhas: dadosBeneficios.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0)]),
            }}
          >
            <Legenda itens={areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" }))} />
            <AreaBarChart dados={dadosBeneficios} areasPresentes={areasPresentes} formatter={fmtMoeda} />
          </ExportCard>

          <ExportCard
            titulo="Encargos por área"
            descricao="INSS retido + FGTS + IRRF (IRRF do mês = férias da competência + normal do mês anterior)"
            arquivo="indicadores-encargos"
            csv={{
              headers: ["Competência", ...areasPresentes],
              linhas: dadosEncargos.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0)]),
            }}
          >
            <Legenda itens={areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" }))} />
            <AreaBarChart dados={dadosEncargos} areasPresentes={areasPresentes} formatter={fmtMoeda} />
          </ExportCard>

          <ExportCard
            titulo="Tabela detalhada — editável"
            descricao="clique num valor pra corrigir; grava assim que sai do campo"
            arquivo="indicadores-detalhado"
            pdfHref={`/admin/indicadores/resumo-pdf?${queryString}`}
            csv={{ headers: csvHeaders, linhas: csvLinhas }}
          >
            <Table containerClassName="max-h-[70vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Competência</TableHead>
                  {CAMPOS_INDICADOR.map((c) => (
                    <TableHead key={c}>{CAMPO_LABEL[c]}</TableHead>
                  ))}
                  <TableHead>IRRF do mês (R$)</TableHead>
                  <TableHead>% Encargos</TableHead>
                  <TableHead>Rotatividade %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.empresaNome}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap text-foreground">{labelSetor(l.setor)}</TableCell>
                    <TableCell>{nomeCompetencia(l.competencia)}</TableCell>
                    {CAMPOS_INDICADOR.map((c) => (
                      <TableCell key={c}>
                        <Input
                          defaultValue={l[c]}
                          disabled={salvandoId === l.id}
                          className="w-24"
                          onBlur={(e) => {
                            if (Number(e.target.value) !== l[c]) handleEditarCampo(l.id, c, e.target.value);
                          }}
                        />
                      </TableCell>
                    ))}
                    <TableCell title="IRRF férias desta competência + IRRF normal da competência anterior">
                      {l.irrf.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{l.percentualEncargos.toFixed(1)}%</TableCell>
                    <TableCell>{l.taxaRotatividade.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ExportCard>
        </div>
      )}
    </div>
  );
}
