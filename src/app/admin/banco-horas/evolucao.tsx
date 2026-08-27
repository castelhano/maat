"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Line,
  LineChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompetenciaSelect } from "@/components/competencia-select";
import { competenciaPadrao } from "@/lib/competencia";
import { ExportCard } from "../beneficios/export-card";
import {
  buscarEvolucao,
  listarOpcoesFiltroResumoMensal,
  type EvolucaoResult,
  type ResumoMensalOpcoesFiltro,
} from "./actions";

const TODOS = "__todos__";

// Paleta validada (banda de luminância + separação CVD + contraste) contra o
// fundo escuro dos cards deste app — node validate_palette.js "#0d9488,#ef4444,#3b82f6,#d97706" --mode dark --surface "#131619".
const COR_CREDITO = "#0d9488";
const COR_DEBITO = "#ef4444";
const COR_A_PAGAR = "#3b82f6";
const COR_SALDO = "#d97706";

const TOOLTIP_STYLE = {
  background: "#131619",
  border: "1px solid #2a3038",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "#e2e8f0",
};

function fmtHoras(decimal: number): string {
  const neg = decimal < 0;
  const abs = Math.abs(decimal);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${neg ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

// Pro CSV usamos "h" no lugar de ":" — o Excel reconhece "H:MM" como horário e, como não suporta
// horário negativo por padrão, mostra #VALOR! nas linhas com saldo negativo.
function fmtHorasCsv(decimal: number): string {
  const neg = decimal < 0;
  const abs = Math.abs(decimal);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${neg ? "-" : ""}${h}h${String(m).padStart(2, "0")}`;
}

function nomeCompetencia(competencia: string): string {
  const [mes, ano] = competencia.split("/");
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

function truncar(texto: string, max: number) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

export function Evolucao() {
  const padrao = competenciaPadrao();
  const [mesInicio, setMesInicio] = useState("01");
  const [anoInicio, setAnoInicio] = useState(padrao.ano);
  const [mesFim, setMesFim] = useState(padrao.mes);
  const [anoFim, setAnoFim] = useState(padrao.ano);
  const [empresaId, setEmpresaId] = useState<string>(TODOS);
  const [departamento, setDepartamento] = useState<string>(TODOS);
  const [setor, setSetor] = useState<string>(TODOS);
  const [opcoes, setOpcoes] = useState<ResumoMensalOpcoesFiltro>({ empresas: [], departamentos: [], setores: [] });
  const [resultado, setResultado] = useState<EvolucaoResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, startCarregando] = useTransition();

  useEffect(() => {
    listarOpcoesFiltroResumoMensal().then(setOpcoes);
    carregar({ mesInicio: "01", anoInicio: padrao.ano, mesFim: padrao.mes, anoFim: padrao.ano });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function carregar(overrides: {
    mesInicio?: string;
    anoInicio?: string;
    mesFim?: string;
    anoFim?: string;
    empresaId?: string;
    departamento?: string;
    setor?: string;
  }) {
    const mi = overrides.mesInicio ?? mesInicio;
    const ai = overrides.anoInicio ?? anoInicio;
    const mf = overrides.mesFim ?? mesFim;
    const af = overrides.anoFim ?? anoFim;
    const e = overrides.empresaId ?? empresaId;
    const d = overrides.departamento ?? departamento;
    const s = overrides.setor ?? setor;

    startCarregando(async () => {
      const result = await buscarEvolucao(`${mi}/${ai}`, `${mf}/${af}`, {
        empresaId: e === TODOS ? undefined : e,
        departamento: d === TODOS ? undefined : d,
        setor: s === TODOS ? undefined : s,
      });
      setResultado(result.data);
      setErro(result.error);
    });
  }

  function handlePeriodoChange(campo: "mesInicio" | "anoInicio" | "mesFim" | "anoFim", valor: string) {
    if (campo === "mesInicio") setMesInicio(valor);
    if (campo === "anoInicio") setAnoInicio(valor);
    if (campo === "mesFim") setMesFim(valor);
    if (campo === "anoFim") setAnoFim(valor);
    carregar({ [campo]: valor });
  }

  function handleEmpresaChange(valor: string) {
    setEmpresaId(valor);
    carregar({ empresaId: valor });
  }

  function handleDepartamentoChange(valor: string) {
    setDepartamento(valor);
    carregar({ departamento: valor });
  }

  function handleSetorChange(valor: string) {
    setSetor(valor);
    carregar({ setor: valor });
  }

  const dadosMes = useMemo(
    () =>
      resultado?.porMes.map((m) => ({
        competencia: nomeCompetencia(m.competencia),
        Crédito: Number(m.creditoBruto.toFixed(2)),
        Débito: Number(m.debitoBruto.toFixed(2)),
        "A Pagar": Number(m.pagoNoMes.toFixed(2)),
        Saldo: Number(m.saldoFinal.toFixed(2)),
      })) ?? [],
    [resultado]
  );

  const dadosSetor = useMemo(
    () =>
      resultado?.porSetor.map((s) => ({
        setor: truncar(s.setor, 26),
        setorCompleto: s.setor,
        Crédito: Number(s.creditoBruto.toFixed(2)),
        Débito: Number(s.debitoBruto.toFixed(2)),
        "A Pagar": Number(s.pagoNoMes.toFixed(2)),
      })) ?? [],
    [resultado]
  );

  const variacao = useMemo(() => {
    if (!resultado || resultado.porMes.length < 2) return null;
    const ultimos = resultado.porMes.slice(-2);
    const [anterior, atual] = ultimos;
    return {
      competencia: nomeCompetencia(atual.competencia),
      creditoDelta: atual.creditoBruto - anterior.creditoBruto,
      debitoDelta: atual.debitoBruto - anterior.debitoBruto,
      pagoDelta: atual.pagoNoMes - anterior.pagoNoMes,
    };
  }, [resultado]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <CompetenciaSelect
            mes={mesInicio}
            ano={anoInicio}
            onMesChange={(v) => handlePeriodoChange("mesInicio", v)}
            onAnoChange={(v) => handlePeriodoChange("anoInicio", v)}
          />
          <span className="font-mono text-[9px] tracking-[.06em] text-text-3 uppercase">de</span>
        </div>
        <div className="flex flex-col gap-2">
          <CompetenciaSelect
            mes={mesFim}
            ano={anoFim}
            onMesChange={(v) => handlePeriodoChange("mesFim", v)}
            onAnoChange={(v) => handlePeriodoChange("anoFim", v)}
          />
          <span className="font-mono text-[9px] tracking-[.06em] text-text-3 uppercase">até</span>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Empresa</Label>
          <Select value={empresaId} onValueChange={(value) => handleEmpresaChange(value as string)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {opcoes.empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Departamento</Label>
          <Select value={departamento} onValueChange={(value) => handleDepartamentoChange(value as string)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {opcoes.departamentos.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Área</Label>
          <Select value={setor} onValueChange={(value) => handleSetorChange(value as string)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {opcoes.setores.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {carregando && <p className="font-mono text-[11px] text-text-3">carregando...</p>}

      {!carregando && erro && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
          <p className="font-mono text-[12px] text-text-2">{erro}</p>
        </div>
      )}

      {!carregando && resultado && (
        <div className="flex flex-col gap-4">
          {variacao && (
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { label: "Crédito vs mês anterior", delta: variacao.creditoDelta, cor: COR_CREDITO },
                  { label: "Débito vs mês anterior", delta: variacao.debitoDelta, cor: COR_DEBITO },
                  { label: "A Pagar vs mês anterior", delta: variacao.pagoDelta, cor: COR_A_PAGAR },
                ] as const
              ).map((v) => (
                <div key={v.label} className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
                  <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">{v.label}</span>
                  <span className="font-mono text-[18px] leading-none font-bold" style={{ color: v.cor }}>
                    {v.delta > 0 ? "+" : v.delta < 0 ? "-" : ""}
                    {fmtHoras(Math.abs(v.delta))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <ExportCard
            titulo="Evolução mensal do banco de horas"
            descricao="crédito, débito e valor pago mês a mês"
            arquivo="banco-horas-evolucao-mensal"
            csv={{
              headers: ["Competência", "Crédito", "Débito", "A Pagar", "Saldo"],
              linhas: resultado.porMes.map((m) => [
                m.competencia,
                fmtHorasCsv(m.creditoBruto),
                fmtHorasCsv(m.debitoBruto),
                fmtHorasCsv(m.pagoNoMes),
                fmtHorasCsv(m.saldoFinal),
              ]),
            }}
          >
            <div className="flex flex-wrap gap-4 pb-2">
              {[
                { cor: COR_CREDITO, label: "Crédito" },
                { cor: COR_DEBITO, label: "Débito" },
                { cor: COR_A_PAGAR, label: "A Pagar" },
              ].map((i) => (
                <div key={i.label} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px]" style={{ background: i.cor }} />
                  <span className="font-mono text-[10px] tracking-[.04em] text-text-2">{i.label}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dadosMes} margin={{ left: 8, right: 24, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
                <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
                <YAxis tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={44} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => fmtHoras(Number(value))} />
                <Line type="monotone" dataKey="Crédito" stroke={COR_CREDITO} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Débito" stroke={COR_DEBITO} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="A Pagar" stroke={COR_A_PAGAR} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ExportCard>

          <ExportCard
            titulo="Saldo líquido mês a mês"
            descricao="soma do saldo final de todos os colaboradores no filtro selecionado"
            arquivo="banco-horas-evolucao-saldo"
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dadosMes} margin={{ left: 8, right: 24, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
                <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
                <YAxis tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={44} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => fmtHoras(Number(value))} />
                <Line type="monotone" dataKey="Saldo" stroke={COR_SALDO} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ExportCard>

          <ExportCard
            titulo="Comparativo por área"
            descricao="totais do período selecionado, agrupados por área (setor)"
            arquivo="banco-horas-evolucao-por-area"
            csv={{
              headers: ["Área", "Crédito", "Débito", "A Pagar", "Registros"],
              linhas: resultado.porSetor.map((s) => [
                s.setor,
                fmtHorasCsv(s.creditoBruto),
                fmtHorasCsv(s.debitoBruto),
                fmtHorasCsv(s.pagoNoMes),
                s.registros,
              ]),
            }}
          >
            <div className="flex flex-wrap gap-4 pb-2">
              {[
                { cor: COR_CREDITO, label: "Crédito" },
                { cor: COR_DEBITO, label: "Débito" },
                { cor: COR_A_PAGAR, label: "A Pagar" },
              ].map((i) => (
                <div key={i.label} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px]" style={{ background: i.cor }} />
                  <span className="font-mono text-[10px] tracking-[.04em] text-text-2">{i.label}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(180, dadosSetor.length * 46)}>
              <BarChart data={dadosSetor} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#7590a8" }}
                  stroke="#2a3038"
                  tickFormatter={(v: number) => fmtHoras(v)}
                />
                <YAxis
                  type="category"
                  dataKey="setor"
                  width={180}
                  tick={{ fontSize: 10, fill: "#8fa0b0" }}
                  stroke="#2a3038"
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => fmtHoras(Number(value))}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.setorCompleto ?? ""}
                />
                <Bar dataKey="Crédito" fill={COR_CREDITO} maxBarSize={14} radius={[0, 4, 4, 0]} />
                <Bar dataKey="Débito" fill={COR_DEBITO} maxBarSize={14} radius={[0, 4, 4, 0]} />
                <Bar dataKey="A Pagar" fill={COR_A_PAGAR} maxBarSize={14} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ExportCard>
        </div>
      )}
    </div>
  );
}
