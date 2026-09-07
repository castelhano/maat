"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportCard } from "../beneficios/export-card";
import { carregarAcidentes, type AcidenteLinha, type OpcaoEmpresaCat } from "./acidentes-actions";
import { SETORES_INDICADOR, labelSetor } from "@/lib/indicadores";

const TODOS = "__todos__";

// Conforme o sistema de origem do CAT: "1" Típico, "2" Doença ocupacional, "3" Trajeto. Só Típico
// e Trajeto entram nesse indicador (Doença fica de fora, como no modelo de referência).
const TIPICO = "1";
const TRAJETO = "3";
const COR_TIPICO = "#d97706";
const COR_TRAJETO = "#3b82f6";
const COR_META = "#1e3a8a";
const META_ACIDENTES = 1;

const TOOLTIP_STYLE = {
  background: "#131619",
  border: "1px solid #2a3038",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "#e2e8f0",
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function primeiroNome(nomeCompleto: string): string {
  const primeiro = nomeCompleto.trim().split(/\s+/)[0] ?? nomeCompleto;
  return primeiro.charAt(0) + primeiro.slice(1).toLowerCase();
}

function anoMes(iso: string): { ano: number; mes: number } {
  const d = new Date(iso);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

type PontoMes = {
  mes: string;
  "Aci. Típico": number;
  "Aci. Trajeto": number;
  labelTipico: string;
  labelTrajeto: string;
};

function pivotPorMes(linhas: AcidenteLinha[], ano: number): PontoMes[] {
  const buckets = Array.from({ length: 12 }, () => ({
    tipico: 0,
    trajeto: 0,
    nomesTipico: [] as string[],
    nomesTrajeto: [] as string[],
  }));

  for (const l of linhas) {
    const { ano: anoDoRegistro, mes } = anoMes(l.dataAcidente);
    if (anoDoRegistro !== ano) continue;
    if (l.tipoAcidente !== TIPICO && l.tipoAcidente !== TRAJETO) continue;

    const bucket = buckets[mes - 1];
    const nome = `${l.cargoNome} - ${primeiroNome(l.funcionarioNome)}`;
    if (l.tipoAcidente === TIPICO) {
      bucket.tipico++;
      bucket.nomesTipico.push(nome);
    } else {
      bucket.trajeto++;
      bucket.nomesTrajeto.push(nome);
    }
  }

  return buckets.map((b, i) => ({
    mes: `${MESES[i]}/${String(ano).slice(2)}`,
    "Aci. Típico": b.tipico,
    "Aci. Trajeto": b.trajeto,
    labelTipico: b.nomesTipico.join(", "),
    labelTrajeto: b.nomesTrajeto.join(", "),
  }));
}

function mediaAno(linhas: AcidenteLinha[], ano: number, tipo: string): number {
  const total = linhas.filter((l) => anoMes(l.dataAcidente).ano === ano && l.tipoAcidente === tipo).length;
  return total / 12;
}

// Tipagem do recharts pra conteúdo de label é ampla demais pra valer a pena reproduzir aqui —
// só extrai x/y/value do que a lib manda em runtime.
function RotuloDiagonal(props: Record<string, unknown>) {
  const value = props.value as string | number | undefined;
  const x = Number(props.x);
  const y = Number(props.y);
  if (!value || Number.isNaN(x) || Number.isNaN(y)) return null;
  return (
    <text x={x} y={y} dy={-6} textAnchor="start" fontSize={9} fill="#8fa0b0" fontFamily="var(--font-mono)" transform={`rotate(-35 ${x} ${y})`}>
      {value}
    </text>
  );
}

export function AcidentesPainel({ empresas }: { empresas: OpcaoEmpresaCat[] }) {
  const [empresaId, setEmpresaId] = useState<string>(empresas[0]?.id ?? TODOS);
  const [setor, setSetor] = useState<string>(TODOS);
  const [linhas, setLinhas] = useState<AcidenteLinha[]>([]);
  const [carregando, startCarregando] = useTransition();

  function carregar(overrides: { empresaId?: string; setor?: string }) {
    const e = overrides.empresaId ?? empresaId;
    const s = overrides.setor ?? setor;
    startCarregando(async () => {
      const result = await carregarAcidentes({
        empresaId: e === TODOS ? undefined : e,
        setor: s === TODOS ? undefined : s,
      });
      setLinhas(result.linhas);
    });
  }

  useEffect(() => {
    carregar({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anosPresentes = useMemo(
    () => [...new Set(linhas.map((l) => anoMes(l.dataAcidente).ano))].sort((a, b) => b - a),
    [linhas]
  );
  const anoPrincipal = anosPresentes[0] ?? new Date().getFullYear();

  const dadosMes = useMemo(() => pivotPorMes(linhas, anoPrincipal), [linhas, anoPrincipal]);

  const empresaNome = empresas.find((e) => e.id === empresaId)?.nome ?? "";

  const csvHeaders = ["Mês", "Aci. Típico", "Aci. Trajeto"];
  const csvLinhas = dadosMes.map((d) => [d.mes, d["Aci. Típico"], d["Aci. Trajeto"]]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label>Empresa</Label>
          <Select value={empresaId} onValueChange={(value) => { setEmpresaId(value as string); carregar({ empresaId: value as string }); }}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Selecione" />
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
          <Select value={setor} onValueChange={(value) => { setSetor(value as string); carregar({ setor: value as string }); }}>
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

      {!carregando && linhas.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
          <p className="font-mono text-[12px] text-text-2">
            Nenhum CAT encontrado para esse filtro. Importe o relatório de CAT na Central de Importações.
          </p>
        </div>
      )}

      {!carregando && linhas.length > 0 && (
        <ExportCard
          titulo={`Acidentes de Trabalho${empresaNome ? ` — ${empresaNome}` : ""}${setor !== TODOS ? ` (${labelSetor(setor)})` : ""}`}
          descricao={`meta: até ${META_ACIDENTES} acidente/mês por tipo`}
          arquivo="indicadores-acidentes"
          csv={{ headers: csvHeaders, linhas: csvLinhas }}
        >
          <div className="mb-2 flex flex-wrap gap-4 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px]" style={{ background: COR_TIPICO }} />
              <span className="font-mono text-[10px] tracking-[.04em] text-text-2">Aci. Típico</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px]" style={{ background: COR_TRAJETO }} />
              <span className="font-mono text-[10px] tracking-[.04em] text-text-2">Aci. Trajeto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5" style={{ background: COR_META }} />
              <span className="font-mono text-[10px] tracking-[.04em] text-text-2">Meta ↓ {META_ACIDENTES}/mês</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dadosMes} margin={{ left: 8, right: 24, top: 32 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={32} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <ReferenceLine
                y={META_ACIDENTES}
                stroke={COR_META}
                strokeWidth={2}
                strokeDasharray="4 3"
                label={{ value: `Meta ↓ ${META_ACIDENTES}`, position: "insideTopRight", fill: COR_META, fontSize: 10 }}
              />
              <Bar dataKey="Aci. Típico" fill={COR_TIPICO} maxBarSize={28} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="labelTipico" content={RotuloDiagonal as never} />
              </Bar>
              <Bar dataKey="Aci. Trajeto" fill={COR_TRAJETO} maxBarSize={28} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="labelTrajeto" content={RotuloDiagonal as never} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div data-slot="table-container" className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max border-collapse font-mono text-[10px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left text-text-3">—</th>
                  {dadosMes.map((d) => (
                    <th key={d.mes} className="px-2 py-1.5 text-right text-text-3">
                      {d.mes}
                    </th>
                  ))}
                  {anosPresentes.map((ano) => (
                    <th key={ano} className="px-2 py-1.5 text-right font-bold text-foreground">
                      Média {ano}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="px-2 py-1.5" style={{ color: COR_TIPICO }}>
                    Aci. Típico
                  </td>
                  {dadosMes.map((d) => (
                    <td key={d.mes} className="px-2 py-1.5 text-right text-text-2">
                      {d["Aci. Típico"]}
                    </td>
                  ))}
                  {anosPresentes.map((ano) => (
                    <td key={ano} className="px-2 py-1.5 text-right font-bold text-foreground">
                      {mediaAno(linhas, ano, TIPICO).toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1.5" style={{ color: COR_TRAJETO }}>
                    Aci. Trajeto
                  </td>
                  {dadosMes.map((d) => (
                    <td key={d.mes} className="px-2 py-1.5 text-right text-text-2">
                      {d["Aci. Trajeto"]}
                    </td>
                  ))}
                  {anosPresentes.map((ano) => (
                    <td key={ano} className="px-2 py-1.5 text-right font-bold text-foreground">
                      {mediaAno(linhas, ano, TRAJETO).toFixed(2)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </ExportCard>
      )}
    </div>
  );
}
