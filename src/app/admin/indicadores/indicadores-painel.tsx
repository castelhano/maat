"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportCard } from "../beneficios/export-card";
import { usePodeOperar } from "@/components/permissoes-provider";
import { AcidentesPainel } from "./acidentes-painel";
import { type OpcaoEmpresaCat } from "./acidentes-actions";
import {
  carregarIndicadores,
  atualizarCampoIndicador,
  carregarRateioTotal,
  atualizarRateioTotal,
  carregarOperacoesMensais,
  atualizarOperacaoMensal,
  type IndicadorLinha,
  type OpcaoEmpresa,
  type OperacaoMensalLinha,
} from "./actions";
import { carregarAbsenteismo, type AbsenteismoMes } from "./absenteismo-actions";
import {
  CAMPOS_INDICADOR,
  RATEIO_CAMPOS,
  CAMPO_LABEL,
  SETORES_INDICADOR,
  MOTIVO_FALTA_LABEL,
  labelSetor,
  calcularDerivados,
  chaveCompetencia,
  type CampoIndicador,
  type CampoRateio,
  type ComDerivados,
} from "@/lib/indicadores";

// Ordem fixa dos motivos de ausência — garante cor consistente entre meses no gráfico empilhado
// (não depende de quais motivos aparecem em cada competência).
const MOTIVOS_ABSENTEISMO = Object.values(MOTIVO_FALTA_LABEL);

const TODOS = "__todos__";

// Painel mostra só a partir daqui — meses mais antigos ficam retroativos demais pro
// acompanhamento do dia a dia (continuam gravados no banco, só não aparecem aqui).
const COMPETENCIA_INICIAL = "06/2026";

// Admitidos/desligados de aprendiz são preenchidos sozinhos pela importação "Admitidos/Desligados
// (aprendiz)" — tirados da tabela detalhada pra não poluir visualmente com colunas que não
// precisam de conferência manual no dia a dia (continuam gravados e usados nos cálculos).
const CAMPOS_OCULTOS_TABELA = new Set<CampoIndicador>([
  "aprendizesAdmitidos",
  "aprendizesDesligados",
  "desligadosTransferencia",
]);
const CAMPOS_TABELA = CAMPOS_INDICADOR.filter((c) => !CAMPOS_OCULTOS_TABELA.has(c));

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

// Rubricas que compõem o Custo Mensal do Empregador (mesma soma de custoTotalEmpregador, ver
// lib/indicadores.ts) — ordem fixa garante cor consistente entre meses no gráfico empilhado.
const RUBRICAS_CUSTO = ["Folha bruta", "FGTS", "INSS Patronal", "CPRB (1,2% receita)", "RAT", "Terceiros", "Benefícios"];
const CORES_RUBRICA = ["#0d9488", "#3b82f6", "#d97706", "#b45309", "#ef4444", "#7c3aed", "#facc15"];

// Reoneração gradual da folha (Lei 14.973/2024) — alíquota de INSS Patronal e de CPRB (sobre a
// receita bruta) vigente em cada ano, pras empresas que eram 100% desoneradas e estão voltando aos
// poucos ao regime normal (2028 em diante: 20% sobre a folha, sem CPRB nenhuma). Só informativo —
// o sistema sempre lê o valor já calculado no relatório, não aplica esses percentuais.
const REGRA_DESONERACAO_POR_ANO = [
  { ano: 2026, inssPatronal: "10%", cprb: "1,2%" },
  { ano: 2027, inssPatronal: "15%", cprb: "0,8%" },
  { ano: 2028, inssPatronal: "20%", cprb: "0% (fim da desoneração)" },
];

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
// Desligados por "TRANSFERENCIA ( COM ONUS )" também saem da barra/% de Desligados (mas não de
// Ativos — a pessoa realmente saiu do quadro, só não conta como rotatividade).
function pivotTurnover(linhas: LinhaComDerivados[]) {
  type Bucket = { admitidos: number; desligados: number; ativos: number };
  const vazio = (): Bucket => ({ admitidos: 0, desligados: 0, ativos: 0 });
  const porCompetencia = new Map<string, Bucket>();
  for (const l of linhas) {
    const bucket = porCompetencia.get(l.competencia) ?? vazio();
    bucket.admitidos += l.admitidos - l.aprendizesAdmitidos;
    bucket.desligados += l.desligados - l.aprendizesDesligados - l.desligadosTransferencia;
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

const COR_VARIACAO = "#facc15";

// % de variação de `valorTotal(d)` vs o mesmo valor no ponto anterior da série — null no primeiro
// ponto (não tem "mês anterior" pra comparar) e sempre que o anterior for 0.
function comVariacaoPct<T>(dados: T[], valorTotal: (d: T) => number): (T & { "Variação %": number | null })[] {
  return dados.map((d, i) => {
    const anterior = i > 0 ? valorTotal(dados[i - 1]) : null;
    const atual = valorTotal(d);
    const variacao = anterior !== null && anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
    return { ...d, "Variação %": variacao };
  });
}

function AreaBarChart({
  dados,
  areasPresentes,
  formatter,
  mostrarVariacao = false,
}: {
  dados: Record<string, string | number>[];
  areasPresentes: string[];
  formatter?: (v: number) => string;
  mostrarVariacao?: boolean;
}) {
  const dadosComVariacao = mostrarVariacao
    ? comVariacaoPct(dados, (d) => areasPresentes.reduce((soma, a) => soma + (Number(d[a]) || 0), 0))
    : dados;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={dadosComVariacao} margin={{ left: 8, right: mostrarVariacao ? 8 : 24, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
        <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
        <YAxis yAxisId="valor" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={56} tickFormatter={formatter} />
        {mostrarVariacao && (
          <YAxis
            yAxisId="pct"
            orientation="right"
            tick={{ fontSize: 10, fill: "#7590a8" }}
            stroke="#2a3038"
            width={48}
            tickFormatter={(v) => `${v}%`}
          />
        )}
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v, nome) => (nome === "Variação %" ? (v === null ? "—" : `${Number(v).toFixed(1)}%`) : formatter ? formatter(Number(v)) : v)}
        />
        {areasPresentes.map((areaLabel) => {
          const valor = SETORES_INDICADOR.find((s) => s.label === areaLabel)?.valor ?? areaLabel;
          return (
            <Bar key={areaLabel} yAxisId="valor" dataKey={areaLabel} fill={COR_SETOR[valor] ?? "#8fa0b0"} maxBarSize={28} radius={[3, 3, 0, 0]} />
          );
        })}
        {mostrarVariacao && (
          <Line yAxisId="pct" type="monotone" dataKey="Variação %" stroke={COR_VARIACAO} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Legenda simples com só o total do mês (soma das áreas) — pros gráficos que já mostram a quebra
// por área no próprio gráfico e não precisam repetir tudo numa tabela grande embaixo.
function TotalPorMes({
  dados,
  areasPresentes,
  formatter,
}: {
  dados: Record<string, string | number>[];
  areasPresentes: string[];
  formatter: (v: number) => string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
      {dados.map((d) => (
        <div key={d.competencia as string} className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-text-3">{d.competencia}:</span>
          <span className="font-mono text-[10px] font-bold text-foreground">
            {formatter(areasPresentes.reduce((soma, a) => soma + (Number(d[a]) || 0), 0))}
          </span>
        </div>
      ))}
    </div>
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

// Campos de Km rodado/Receita com estado próprio, remontado via `key` (empresa+competência) pelo
// componente pai — evita sincronizar texto a partir de dado carregado dentro de um efeito.
function FormularioOperacao({
  kmInicial,
  receitaInicial,
  salvando,
  onSalvar,
}: {
  kmInicial: string;
  receitaInicial: string;
  salvando: boolean;
  onSalvar: (km: string, receita: string) => void;
}) {
  const [km, setKm] = useState(kmInicial);
  const [receita, setReceita] = useState(receitaInicial);
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label>Km rodado</Label>
        <Input value={km} disabled={salvando} onChange={(e) => setKm(e.target.value)} className="w-36" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Receita bruta (R$)</Label>
        <Input value={receita} disabled={salvando} onChange={(e) => setReceita(e.target.value)} className="w-36" />
      </div>
      <Button onClick={() => onSalvar(km, receita)} disabled={salvando}>
        {salvando ? "Salvando..." : "Salvar"}
      </Button>
    </>
  );
}

export function IndicadoresPainel({ empresas, empresasCat }: { empresas: OpcaoEmpresa[]; empresasCat: OpcaoEmpresaCat[] }) {
  const podeOperar = usePodeOperar("indicadores");
  const [empresaId, setEmpresaId] = useState<string>(TODOS);
  const [setor, setSetor] = useState<string>(TODOS);
  const [linhas, setLinhas] = useState<IndicadorLinha[]>([]);
  const [absenteismoMeses, setAbsenteismoMeses] = useState<AbsenteismoMes[]>([]);
  const [operacoesMensais, setOperacoesMensais] = useState<OperacaoMensalLinha[]>([]);
  const [carregando, startCarregando] = useTransition();
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [indicadorAtivo, setIndicadorAtivo] = useState("turnover");
  const [mostrarDadosBrutos, setMostrarDadosBrutos] = useState(false);

  function carregar(overrides: { empresaId?: string; setor?: string }) {
    const e = overrides.empresaId ?? empresaId;
    const s = overrides.setor ?? setor;
    const filtro = { empresaId: e === TODOS ? undefined : e, setor: s === TODOS ? undefined : s };
    startCarregando(async () => {
      const [result, absenteismo, operacoes] = await Promise.all([
        carregarIndicadores(filtro),
        carregarAbsenteismo(filtro),
        carregarOperacoesMensais({ empresaId: filtro.empresaId }),
      ]);
      // Só mostra a partir de jun/2026 — meses anteriores a isso são retroativos demais pro
      // acompanhamento do dia a dia (continuam gravados no banco, só não aparecem aqui).
      const inicio = chaveCompetencia(COMPETENCIA_INICIAL);
      setLinhas(result.linhas.filter((l) => chaveCompetencia(l.competencia) >= inicio));
      setAbsenteismoMeses(absenteismo.meses.filter((m) => chaveCompetencia(m.competencia) >= inicio));
      setOperacoesMensais(operacoes.linhas.filter((o) => chaveCompetencia(o.competencia) >= inicio));
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
  // Vem do relatório de Faltas (mesma fonte do gráfico "por motivo"), não mais do PDF do Resumo
  // Gerencial — esse só passou a trazer atestado médico a partir de jul/2026, ficando incompleto
  // pra trás disso (ver absenteismo-actions.ts).
  const dadosAbsenteismo = useMemo(
    () =>
      absenteismoMeses.map((m) => {
        const porArea = {} as Record<string, number>;
        for (const item of m.porArea) {
          const label = labelSetor(item.setor);
          porArea[label] = (porArea[label] ?? 0) + item.dias;
        }
        return { competencia: nomeCompetencia(m.competencia), ...porArea } as PontoPorArea;
      }),
    [absenteismoMeses]
  );
  // Um gráfico só: barras empilhadas por motivo (dias) + linha de % Absenteísmo + meta — em vez de
  // dois cards separados (um de % e outro de motivo por mês selecionado).
  const dadosAbsenteismoPct = useMemo(
    () =>
      absenteismoMeses.map((m) => {
        const porMotivo = {} as Record<string, number>;
        for (const motivo of MOTIVOS_ABSENTEISMO) porMotivo[motivo] = 0;
        for (const item of m.porMotivo) porMotivo[item.motivo] = (porMotivo[item.motivo] ?? 0) + item.dias;
        return {
          competencia: nomeCompetencia(m.competencia),
          Dias: m.totalDias,
          Absenteísmo: m.percentual,
          ...porMotivo,
        } as { competencia: string; Dias: number; Absenteísmo: number } & Record<string, number>;
      }),
    [absenteismoMeses]
  );
  // Junta os dias por área com o % Absenteísmo geral (mesmo mês) — pra mostrar a linha de % e a
  // meta de 1,5% nesse gráfico também, sem duplicar a conta (o % já é só um total da empresa, não
  // por área).
  const dadosAbsenteismoAreaComPct = useMemo(() => {
    const percentualPorCompetencia = new Map(dadosAbsenteismoPct.map((d) => [d.competencia, d.Absenteísmo]));
    return dadosAbsenteismo.map(
      (d) =>
        ({ ...d, Absenteísmo: percentualPorCompetencia.get(d.competencia) ?? 0 }) as PontoPorArea & { Absenteísmo: number }
    );
  }, [dadosAbsenteismo, dadosAbsenteismoPct]);
  const dadosBeneficios = useMemo(() => pivotPorArea(dados, "custoBeneficios"), [dados]);
  const dadosEncargos = useMemo(() => pivotPorArea(dados, "encargos"), [dados]);
  const dadosHoraExtra = useMemo(() => pivotPorArea(dados, "horaExtra"), [dados]);
  const dadosHoraExtraHoras = useMemo(() => pivotPorArea(dados, "horaExtraHoras"), [dados]);
  // Custo de rotatividade por mês (não por área) — verbas de rescisão automáticas + manual
  // (Reclamatória/CCP), total e custo médio por desligamento (mesmos desligados do turnover, sem
  // aprendiz/transferência com ônus).
  const dadosRotatividade = useMemo(() => {
    const porCompetencia = new Map<string, { automatico: number; manual: number; desligados: number }>();
    for (const l of dados) {
      const b = porCompetencia.get(l.competencia) ?? { automatico: 0, manual: 0, desligados: 0 };
      b.automatico += l.custoRescisaoAutomatico;
      b.manual += l.custoRescisaoManual;
      b.desligados += l.desligados - l.aprendizesDesligados - l.desligadosTransferencia;
      porCompetencia.set(l.competencia, b);
    }
    return [...porCompetencia.entries()]
      .sort((a, b) => chaveCompetencia(a[0]) - chaveCompetencia(b[0]))
      .map(([competencia, v]) => {
        const total = v.automatico + v.manual;
        return {
          competencia: nomeCompetencia(competencia),
          "Verbas automáticas": v.automatico,
          "Reclamatória/CCP (manual)": v.manual,
          Total: total,
          Desligados: v.desligados,
          "Custo médio/desligado": v.desligados > 0 ? total / v.desligados : 0,
        };
      });
  }, [dados]);
  // Custo mensal do empregador por rubrica (não por área) — soma tudo que compõe
  // custoTotalEmpregador, quebrado em Folha/FGTS/INSS Patronal/CPRB/RAT/Terceiros/Benefícios.
  // Durante a reoneração gradual da folha (2026-2028, Lei 14.973/2024), empresas com desoneração
  // pagam INSS Patronal (10% este ano, 15% em 2027) E CPRB (1,2% este ano, 0,8% em 2027) AO MESMO
  // TEMPO — por isso as duas rubricas aparecem juntas, uma não troca pela outra. Em empresas sem
  // desoneração, CPRB fica sempre 0.
  const dadosCustoMensal = useMemo(() => {
    const vazio = () => Object.fromEntries(RUBRICAS_CUSTO.map((r) => [r, 0])) as Record<string, number>;
    const porCompetencia = new Map<string, Record<string, number>>();
    for (const l of dados) {
      const b = porCompetencia.get(l.competencia) ?? vazio();
      b["Folha bruta"] += l.folhaBruta + l.folhaSuplementar;
      b.FGTS += l.fgts;
      b["INSS Patronal"] += l.inssPatronal;
      b["CPRB (1,2% receita)"] += l.cprbDesoneracao;
      b.RAT += l.acidenteTrabalho;
      b.Terceiros += l.terceiros;
      b["Benefícios"] += l.custoBeneficios;
      porCompetencia.set(l.competencia, b);
    }
    return [...porCompetencia.entries()]
      .sort((a, b) => chaveCompetencia(a[0]) - chaveCompetencia(b[0]))
      .map(
        ([competencia, v]) =>
          ({ competencia: nomeCompetencia(competencia), ...v, Total: Object.values(v).reduce((s, n) => s + n, 0) }) as {
            competencia: string;
            Total: number;
          } & Record<string, number>
      );
  }, [dados]);

  // Custo/Receita por Km rodado e % Folha sobre Receita — só entram meses com Km/Receita
  // lançados (ver OperacaoMensal); custo e folha somam todas as áreas da empresa (ou de todas as
  // empresas, se "Todas" estiver selecionado — aproximação de frota total).
  const dadosOperacional = useMemo(() => {
    const porCompetenciaCusto = new Map<string, { custo: number; folha: number }>();
    for (const l of dados) {
      const b = porCompetenciaCusto.get(l.competencia) ?? { custo: 0, folha: 0 };
      b.custo += l.custoTotalEmpregador;
      b.folha += l.folhaBruta + l.folhaSuplementar;
      porCompetenciaCusto.set(l.competencia, b);
    }
    const porCompetenciaOperacao = new Map<string, { km: number; receita: number }>();
    for (const o of operacoesMensais) {
      const b = porCompetenciaOperacao.get(o.competencia) ?? { km: 0, receita: 0 };
      b.km += o.kmRodado;
      b.receita += o.receita;
      porCompetenciaOperacao.set(o.competencia, b);
    }
    return [...porCompetenciaOperacao.keys()]
      .filter((c) => porCompetenciaCusto.has(c))
      .sort((a, b) => chaveCompetencia(a) - chaveCompetencia(b))
      .map((c) => {
        const { custo, folha } = porCompetenciaCusto.get(c)!;
        const { km, receita } = porCompetenciaOperacao.get(c)!;
        return {
          competencia: nomeCompetencia(c),
          "Custo/Km": km > 0 ? custo / km : 0,
          "Receita/Km": km > 0 ? receita / km : 0,
          "% Folha/Receita": receita > 0 ? (folha / receita) * 100 : 0,
        };
      });
  }, [dados, operacoesMensais]);

  const competenciasTabela = useMemo(
    () => [...new Set(dados.map((l) => l.competencia))].sort((a, b) => chaveCompetencia(a) - chaveCompetencia(b)),
    [dados]
  );
  const [competenciaTabela, setCompetenciaTabela] = useState<string>(TODOS);
  const dadosTabela = useMemo(
    () => (competenciaTabela === TODOS ? dados : dados.filter((l) => l.competencia === competenciaTabela)),
    [dados, competenciaTabela]
  );

  // Folha suplementar, café da manhã, refeitório e pró-saúde: um valor TOTAL por empresa+
  // competência (não por área) — o rateio por área acontece no servidor (ver carregarIndicadores).
  // Só dá pra editar com uma empresa específica selecionada. Um campo por vez (escolhido no
  // seletor "Lançamento"), pra não empilhar 4 caixinhas na tela.
  const [competenciaRateioSelecionada, setCompetenciaRateioSelecionada] = useState<string | null>(null);
  const competenciaRateio =
    competenciaRateioSelecionada && competenciasTabela.includes(competenciaRateioSelecionada)
      ? competenciaRateioSelecionada
      : (competenciasTabela.at(-1) ?? null);
  const [campoRateioSelecionado, setCampoRateioSelecionado] = useState<CampoRateio>(RATEIO_CAMPOS[0]);
  const [valorRateio, setValorRateio] = useState<string>("");
  const [carregandoRateio, iniciarCarregarRateio] = useTransition();
  const [salvandoRateio, setSalvandoRateio] = useState(false);

  useEffect(() => {
    if (empresaId === TODOS || !competenciaRateio) return;
    iniciarCarregarRateio(async () => {
      const r = await carregarRateioTotal(empresaId, competenciaRateio, campoRateioSelecionado);
      setValorRateio(String(r.valor));
    });
  }, [empresaId, competenciaRateio, campoRateioSelecionado, iniciarCarregarRateio]);

  // Aceita vírgula como separador decimal (formato brasileiro, ex.: "5.839,80"), além do ponto.
  function paraNumero(texto: string): number {
    const limpo = texto.trim();
    return limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
  }

  async function handleSalvarRateio() {
    if (empresaId === TODOS || !competenciaRateio) return;
    const valor = paraNumero(valorRateio);
    if (Number.isNaN(valor)) {
      toast.error("Valor inválido.");
      return;
    }
    setSalvandoRateio(true);
    const result = await atualizarRateioTotal(empresaId, competenciaRateio, campoRateioSelecionado, valor);
    setSalvandoRateio(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${CAMPO_LABEL[campoRateioSelecionado]} atualizado — rateando por área.`);
    carregar({});
  }

  // Km rodado + Receita bruta mensal — mesmo padrão do lançamento total acima, mas guardado num
  // model próprio (OperacaoMensal) porque não é rateado por área, é da empresa inteira.
  const [competenciaOperacaoSelecionada, setCompetenciaOperacaoSelecionada] = useState<string | null>(null);
  const competenciaOperacao =
    competenciaOperacaoSelecionada && competenciasTabela.includes(competenciaOperacaoSelecionada)
      ? competenciaOperacaoSelecionada
      : (competenciasTabela.at(-1) ?? null);
  const [salvandoOperacao, setSalvandoOperacao] = useState(false);
  const registroOperacao =
    empresaId !== TODOS && competenciaOperacao
      ? operacoesMensais.find((o) => o.empresaId === empresaId && o.competencia === competenciaOperacao)
      : undefined;

  async function handleSalvarOperacao(kmTexto: string, receitaTexto: string) {
    if (empresaId === TODOS || !competenciaOperacao) return;
    const km = paraNumero(kmTexto);
    const receita = paraNumero(receitaTexto);
    if (Number.isNaN(km) || Number.isNaN(receita)) {
      toast.error("Valor inválido.");
      return;
    }
    setSalvandoOperacao(true);
    const result = await atualizarOperacaoMensal(empresaId, competenciaOperacao, km, receita);
    setSalvandoOperacao(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Km rodado / Receita atualizado.");
    carregar({});
  }

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
    ...CAMPOS_TABELA.map((c) => CAMPO_LABEL[c]),
    "IRRF do mês (R$)",
    "% Encargos",
    "Rotatividade %",
  ];
  const csvLinhas = dadosTabela.map((l) => [
    l.empresaNome,
    labelSetor(l.setor),
    l.competencia,
    ...CAMPOS_TABELA.map((c) => l[c]),
    l.irrf,
    l.percentualEncargos,
    l.taxaRotatividade,
  ]);
  if (dadosTabela.length > 0) {
    csvLinhas.push([
      "Total",
      "",
      "",
      ...CAMPOS_TABELA.map((c) => dadosTabela.reduce((soma, l) => soma + l[c], 0)),
      dadosTabela.reduce((soma, l) => soma + l.irrf, 0),
      "",
      "",
    ]);
  }

  // Mesmos dados da tabela detalhada, mas em lista — uma linha por Empresa+Área+Competência+
  // Indicador+Valor, em vez de uma coluna por indicador. Melhor pra jogar num Excel dinâmico depois.
  const csvListaHeaders = ["Empresa", "Área", "Competência", "Indicador", "Valor"];
  const csvListaLinhas = dadosTabela.flatMap((l) => [
    ...CAMPOS_TABELA.map((c) => [l.empresaNome, labelSetor(l.setor), l.competencia, CAMPO_LABEL[c], l[c]]),
    [l.empresaNome, labelSetor(l.setor), l.competencia, "IRRF do mês (R$)", l.irrf],
    [l.empresaNome, labelSetor(l.setor), l.competencia, "% Encargos", l.percentualEncargos],
    [l.empresaNome, labelSetor(l.setor), l.competencia, "Rotatividade %", l.taxaRotatividade],
  ]);

  const queryString = new URLSearchParams({
    ...(empresaId !== TODOS ? { empresaId } : {}),
    ...(setor !== TODOS ? { setor } : {}),
  }).toString();

  // Registro dos indicadores do menu lateral — cada um carrega seu próprio gráfico/tabela, já
  // montados a partir dos dados calculados acima. Trocar de indicador só troca qual `render()` é
  // chamado; nenhum cálculo é refeito.
  const secoes: { id: string; grupo: string; label: string; descricao: string; render: () => React.ReactNode }[] = [
    {
      id: "turnover",
      grupo: "Pessoas",
      label: "Turnover",
      descricao: `(Admitidos + Desligados) / 2 / Total de colaboradores × 100 — meta ${META_TURNOVER.toLocaleString("pt-BR")}%`,
      render: () => (
        <ExportCard
          titulo="Turnover — admissões x desligamentos"
          descricao={`(Admitidos + Desligados) / 2 / Total de colaboradores × 100 — meta ${META_TURNOVER.toLocaleString("pt-BR")}%`}
          arquivo="indicadores-turnover"
          csv={{
            headers: ["Competência", "Admitidos", "Desligados", "Total Colab.", "Turnover %"],
            linhas: dadosTurnover.map((d) => [d.competencia, d.Admitidos, d.Desligados, d["Total Colab."], d.Turnover]),
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
                domain={[0, (max: number) => Math.max(max, META_TURNOVER * 1.2)]}
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
      ),
    },
    {
      id: "headcount",
      grupo: "Pessoas",
      label: "Headcount",
      descricao: "colaboradores ativos ao fim de cada competência, por área",
      render: () => (
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
      ),
    },
    {
      id: "hora-extra",
      grupo: "Pessoas",
      label: "Horas extras",
      descricao: "hora extra 50% (códigos 00003 + 00659) em R$ e em horas, por área",
      render: () => (
        <ExportCard
          titulo="Horas extras (50%) por área"
          descricao="valor pago (códigos 00003 + 00659) e quantidade de horas, por área"
          arquivo="indicadores-hora-extra"
          csv={{
            headers: ["Competência", ...areasPresentes.map((a) => `${a} (R$)`), ...areasPresentes.map((a) => `${a} (h)`)],
            linhas: dadosHoraExtra.map((d, i) => [
              d.competencia,
              ...areasPresentes.map((a) => d[a] ?? 0),
              ...areasPresentes.map((a) => dadosHoraExtraHoras[i]?.[a] ?? 0),
            ]),
          }}
        >
          <Legenda
            itens={[
              ...areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" })),
              { cor: COR_VARIACAO, label: "Variação % vs mês anterior" },
            ]}
          />
          <AreaBarChart dados={dadosHoraExtra} areasPresentes={areasPresentes} formatter={fmtMoeda} mostrarVariacao />
          <TotalPorMes dados={dadosHoraExtra} areasPresentes={areasPresentes} formatter={fmtMoeda} />
          <p className="mt-3 mb-1 font-mono text-[10px] font-bold uppercase tracking-[.06em] text-text-3">Total de horas por mês</p>
          <TotalPorMes dados={dadosHoraExtraHoras} areasPresentes={areasPresentes} formatter={(v) => `${v.toFixed(1)}h`} />
        </ExportCard>
      ),
    },
    {
      id: "absenteismo-pct",
      grupo: "Ausências",
      label: "Absenteísmo (%)",
      descricao: "dias de ausência ÷ (ativos × dias úteis do mês) × 100, por motivo — meta 1,5%",
      render: () => (
        <ExportCard
          titulo="Absenteísmo (%) — meta 1,5%"
          descricao="barras = dias de ausência por motivo; linha = % (dias de ausência ÷ (ativos × dias úteis do mês) × 100) — dia útil aqui conta sábado, só desconta domingo e feriado nacional"
          arquivo="indicadores-absenteismo-percentual"
          csv={{
            headers: ["Competência", "Dias de ausência", "Absenteísmo %", ...MOTIVOS_ABSENTEISMO],
            linhas: dadosAbsenteismoPct.map((d) => [
              d.competencia,
              d.Dias,
              d.Absenteísmo,
              ...MOTIVOS_ABSENTEISMO.map((m) => d[m] ?? 0),
            ]),
          }}
        >
          <Legenda
            itens={[
              ...MOTIVOS_ABSENTEISMO.map((motivo, i) => ({ cor: CORES_MOTIVO[i % CORES_MOTIVO.length], label: motivo })),
              { cor: COR_ABSENTEISMO, label: "Absenteísmo %" },
              { cor: COR_META, label: `Meta ${META_ABSENTEISMO.toLocaleString("pt-BR")}%` },
            ]}
          />
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={dadosAbsenteismoPct} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
              <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
              <YAxis yAxisId="dias" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={40} />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 10, fill: "#7590a8" }}
                stroke="#2a3038"
                width={48}
                tickFormatter={(v) => `${v}%`}
                domain={[0, (max: number) => Math.max(max, META_ABSENTEISMO * 1.2)]}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, nome) => (nome === "Absenteísmo" ? `${Number(v).toFixed(2)}%` : v)} />
              {MOTIVOS_ABSENTEISMO.map((motivo, i) => (
                <Bar key={motivo} yAxisId="dias" dataKey={motivo} stackId="motivo" fill={CORES_MOTIVO[i % CORES_MOTIVO.length]} maxBarSize={36} />
              ))}
              <Line yAxisId="pct" type="monotone" dataKey="Absenteísmo" stroke={COR_ABSENTEISMO} strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine
                yAxisId="pct"
                y={META_ABSENTEISMO}
                stroke={COR_META}
                strokeWidth={2}
                strokeDasharray="4 3"
                label={{ value: `Meta ${META_ABSENTEISMO.toLocaleString("pt-BR")}%`, position: "insideTopRight", fill: COR_META, fontSize: 10 }}
              />
            </ComposedChart>
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
                  {MOTIVOS_ABSENTEISMO.map((motivo) => (
                    <tr key={motivo} className="border-b border-border/50">
                      <td className="px-2 py-1.5 text-text-2">{motivo}</td>
                      {dadosAbsenteismoPct.map((d) => (
                        <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                          {d[motivo] ?? 0}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-bold text-foreground">
                        {media(dadosAbsenteismoPct.map((d) => Number(d[motivo]) || 0)).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-border/50">
                    <td className="px-2 py-1.5 font-bold text-foreground">Total dias</td>
                    {dadosAbsenteismoPct.map((d) => (
                      <td key={d.competencia} className="px-2 py-1.5 text-right font-bold text-foreground">
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
      ),
    },
    {
      id: "absenteismo-area",
      grupo: "Ausências",
      label: "Absenteísmo por área",
      descricao: "dias de ausência por área (relatório de Faltas) + % geral da empresa",
      render: () => (
        <ExportCard
          titulo="Absenteísmo (dias) por área"
          descricao="dias de ausência por área (relatório de Faltas, todos os motivos); linha = % Absenteísmo geral da empresa, com meta de 1,5%"
          arquivo="indicadores-absenteismo"
          csv={{
            headers: ["Competência", ...areasPresentes, "Absenteísmo %"],
            linhas: dadosAbsenteismoAreaComPct.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0), d.Absenteísmo]),
          }}
        >
          <Legenda
            itens={[
              ...areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" })),
              { cor: COR_ABSENTEISMO, label: "Absenteísmo %" },
              { cor: COR_META, label: `Meta ${META_ABSENTEISMO.toLocaleString("pt-BR")}%` },
            ]}
          />
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={dadosAbsenteismoAreaComPct} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
              <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
              <YAxis yAxisId="dias" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={40} />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 10, fill: "#7590a8" }}
                stroke="#2a3038"
                width={48}
                tickFormatter={(v) => `${v}%`}
                domain={[0, (max: number) => Math.max(max, META_ABSENTEISMO * 1.2)]}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, nome) => (nome === "Absenteísmo" ? `${Number(v).toFixed(2)}%` : v)} />
              {areasPresentes.map((areaLabel) => {
                const valor = SETORES_INDICADOR.find((s) => s.label === areaLabel)?.valor ?? areaLabel;
                return <Bar key={areaLabel} yAxisId="dias" dataKey={areaLabel} fill={COR_SETOR[valor] ?? "#8fa0b0"} maxBarSize={28} radius={[3, 3, 0, 0]} />;
              })}
              <Line yAxisId="pct" type="monotone" dataKey="Absenteísmo" stroke={COR_ABSENTEISMO} strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine
                yAxisId="pct"
                y={META_ABSENTEISMO}
                stroke={COR_META}
                strokeWidth={2}
                strokeDasharray="4 3"
                label={{ value: `Meta ${META_ABSENTEISMO.toLocaleString("pt-BR")}%`, position: "insideTopRight", fill: COR_META, fontSize: 10 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ExportCard>
      ),
    },
    {
      id: "custo-mensal",
      grupo: "Custo",
      label: "Custo Mensal do Empregador",
      descricao: "folha + FGTS + INSS Patronal + CPRB (empresas com desoneração) + RAT + Terceiros + benefícios, por rubrica",
      render: () => (
        <ExportCard
          titulo="Custo Mensal do Empregador — por rubrica"
          descricao="tudo que custa manter a equipe no mês: folha bruta (+ folha suplementar) + FGTS + INSS Patronal + CPRB + RAT + Terceiros + benefícios — empresas com desoneração pagam INSS Patronal E CPRB juntos durante a reoneração gradual (2026-2028)"
          arquivo="indicadores-custo-mensal"
          csv={{
            headers: ["Competência", ...RUBRICAS_CUSTO, "Total"],
            linhas: dadosCustoMensal.map((d) => [d.competencia, ...RUBRICAS_CUSTO.map((r) => d[r] ?? 0), d.Total]),
          }}
        >
          <Legenda
            itens={[
              ...RUBRICAS_CUSTO.map((r, i) => ({ cor: CORES_RUBRICA[i % CORES_RUBRICA.length], label: r })),
              { cor: COR_VARIACAO, label: "Variação % vs mês anterior" },
            ]}
          />
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={comVariacaoPct(dadosCustoMensal, (d) => d.Total)} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
              <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
              <YAxis yAxisId="valor" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={56} tickFormatter={fmtMoeda} />
              <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={48} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, nome) => (nome === "Variação %" ? (v === null ? "—" : `${Number(v).toFixed(1)}%`) : fmtMoeda(Number(v)))}
              />
              {RUBRICAS_CUSTO.map((rubrica, i) => (
                <Bar key={rubrica} yAxisId="valor" dataKey={rubrica} stackId="custo" fill={CORES_RUBRICA[i % CORES_RUBRICA.length]} maxBarSize={36} />
              ))}
              <Line yAxisId="pct" type="monotone" dataKey="Variação %" stroke={COR_VARIACAO} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>

          {dadosCustoMensal.length > 0 && (
            <div data-slot="table-container" className="mt-3 overflow-x-auto pr-14 pl-10">
              <table className="w-full table-fixed border-collapse font-mono text-[10px]">
                <colgroup>
                  <col className="w-24" />
                  {dadosCustoMensal.map((d) => (
                    <col key={d.competencia} />
                  ))}
                  <col />
                </colgroup>
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-1.5 text-left text-text-3">—</th>
                    {dadosCustoMensal.map((d) => (
                      <th key={d.competencia} className="px-2 py-1.5 text-right text-text-3">
                        {d.competencia}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-bold text-foreground">Média</th>
                  </tr>
                </thead>
                <tbody>
                  {RUBRICAS_CUSTO.map((rubrica) => (
                    <tr key={rubrica} className="border-b border-border/50">
                      <td className="px-2 py-1.5 text-text-2">{rubrica}</td>
                      {dadosCustoMensal.map((d) => (
                        <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                          {fmtMoeda(Number(d[rubrica]) || 0)}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-bold text-foreground">
                        {fmtMoeda(media(dadosCustoMensal.map((d) => Number(d[rubrica]) || 0)))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-2 py-1.5 font-bold text-warning">Total</td>
                    {dadosCustoMensal.map((d) => (
                      <td key={d.competencia} className="px-2 py-1.5 text-right font-bold text-warning">
                        {fmtMoeda(d.Total)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold text-warning">
                      {fmtMoeda(media(dadosCustoMensal.map((d) => d.Total)))}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 text-text-3">Variação vs mês anterior</td>
                    {dadosCustoMensal.map((d, i) => {
                      const anterior = dadosCustoMensal[i - 1];
                      const variacao = anterior && anterior.Total > 0 ? ((d.Total - anterior.Total) / anterior.Total) * 100 : null;
                      return (
                        <td
                          key={d.competencia}
                          className={`px-2 py-1.5 text-right ${variacao === null ? "text-text-3" : variacao > 0 ? "text-danger" : "text-success"}`}
                        >
                          {variacao === null ? "—" : `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)}%`}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-border bg-white/[.03] p-3">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.06em] text-text-3">
              Reoneração gradual da folha (Lei 14.973/2024) — alíquota vigente em cada ano
            </p>
            <table className="w-full max-w-xs border-collapse font-mono text-[10px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1 text-left text-text-3">Ano</th>
                  <th className="px-2 py-1 text-right text-text-3">INSS Patronal</th>
                  <th className="px-2 py-1 text-right text-text-3">CPRB (s/ receita)</th>
                </tr>
              </thead>
              <tbody>
                {REGRA_DESONERACAO_POR_ANO.map((r) => (
                  <tr key={r.ano} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-1 text-text-2">{r.ano}</td>
                    <td className="px-2 py-1 text-right text-text-2">{r.inssPatronal}</td>
                    <td className="px-2 py-1 text-right text-text-2">{r.cprb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[10px] text-text-3">
              só pra referência — o sistema sempre lê o valor já calculado no Resumo Gerencial, não aplica esses percentuais.
            </p>
          </div>
        </ExportCard>
      ),
    },
    {
      id: "custo-area",
      grupo: "Custo",
      label: "Custo total por área",
      descricao: "folha bruta + FGTS + INSS Patronal + CPRB + RAT + Terceiros + benefícios, por área",
      render: () => (
        <ExportCard
          titulo="Custo total do empregador por área"
          descricao="folha bruta + FGTS + INSS Patronal + CPRB + RAT + Terceiros + benefícios (cesta, VR, vale-gás)"
          arquivo="indicadores-custo-total"
          csv={{
            headers: ["Competência", ...areasPresentes],
            linhas: dadosCusto.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0)]),
          }}
        >
          <Legenda
            itens={[
              ...areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" })),
              { cor: COR_VARIACAO, label: "Variação % vs mês anterior" },
            ]}
          />
          <AreaBarChart dados={dadosCusto} areasPresentes={areasPresentes} formatter={fmtMoeda} mostrarVariacao />
          <TotalPorMes dados={dadosCusto} areasPresentes={areasPresentes} formatter={fmtMoeda} />
        </ExportCard>
      ),
    },
    {
      id: "beneficios",
      grupo: "Custo",
      label: "Benefícios por área",
      descricao: "cesta básica + vale-gás + vale-alimentação + café da manhã + refeitório + pró-saúde",
      render: () => (
        <ExportCard
          titulo="Custo de benefícios por área"
          descricao="cesta básica + vale-gás + vale-alimentação + café da manhã + refeitório + pró-saúde"
          arquivo="indicadores-beneficios"
          csv={{
            headers: ["Competência", ...areasPresentes],
            linhas: dadosBeneficios.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0)]),
          }}
        >
          <Legenda
            itens={[
              ...areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" })),
              { cor: COR_VARIACAO, label: "Variação % vs mês anterior" },
            ]}
          />
          <AreaBarChart dados={dadosBeneficios} areasPresentes={areasPresentes} formatter={fmtMoeda} mostrarVariacao />
          <TotalPorMes dados={dadosBeneficios} areasPresentes={areasPresentes} formatter={fmtMoeda} />
        </ExportCard>
      ),
    },
    {
      id: "encargos",
      grupo: "Encargos",
      label: "Encargos por área",
      descricao: "INSS retido + FGTS + IRRF + INSS Patronal + CPRB + RAT + Terceiros",
      render: () => (
        <ExportCard
          titulo="Encargos por área"
          descricao="INSS retido + FGTS + IRRF + INSS patronal + CPRB + Acidente de Trabalho (RAT) + Terceiros (IRRF do mês = férias da competência + normal do mês anterior)"
          arquivo="indicadores-encargos"
          csv={{
            headers: ["Competência", ...areasPresentes],
            linhas: dadosEncargos.map((d) => [d.competencia, ...areasPresentes.map((a) => d[a] ?? 0)]),
          }}
        >
          <Legenda
            itens={[
              ...areasPresentes.map((a) => ({ label: a, cor: COR_SETOR[SETORES_INDICADOR.find((s) => s.label === a)?.valor ?? a] ?? "#8fa0b0" })),
              { cor: COR_VARIACAO, label: "Variação % vs mês anterior" },
            ]}
          />
          <AreaBarChart dados={dadosEncargos} areasPresentes={areasPresentes} formatter={fmtMoeda} mostrarVariacao />
          <TotalPorMes dados={dadosEncargos} areasPresentes={areasPresentes} formatter={fmtMoeda} />
        </ExportCard>
      ),
    },
    {
      id: "rotatividade",
      grupo: "Custo",
      label: "Custo de rotatividade",
      descricao: "verbas de rescisão dos desligados (férias, 13º, saldo, aviso prévio, multa FGTS, VR) + manual de Reclamatória/CCP — total e por desligamento",
      render: () => (
        <ExportCard
          titulo="Custo de rotatividade — rescisões do mês"
          descricao="férias indenizadas/proporcionais + 1/3 + 13º proporcional + saldo de salário + VR rescisório + aviso prévio indenizado (+ reflexos) + multa de FGTS (coluna Desligados do Resumo Gerencial) + valor manual de Reclamatória/CCP (acordos que saem zerados no relatório — lance em Dados brutos / lançamentos)"
          arquivo="indicadores-rotatividade"
          csv={{
            headers: ["Competência", "Verbas automáticas", "Reclamatória/CCP (manual)", "Total", "Desligados", "Custo médio/desligado"],
            linhas: dadosRotatividade.map((d) => [
              d.competencia,
              d["Verbas automáticas"],
              d["Reclamatória/CCP (manual)"],
              d.Total,
              d.Desligados,
              d["Custo médio/desligado"],
            ]),
          }}
        >
          <Legenda
            itens={[
              { cor: COR_ADMITIDOS, label: "Verbas automáticas" },
              { cor: COR_DESLIGADOS, label: "Reclamatória/CCP (manual)" },
              { cor: COR_TURNOVER, label: "Custo médio/desligado" },
            ]}
          />
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={dadosRotatividade} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
              <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
              <YAxis yAxisId="valor" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={56} tickFormatter={fmtMoeda} />
              <YAxis yAxisId="media" orientation="right" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={56} tickFormatter={fmtMoeda} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtMoeda(Number(v))} />
              <Bar yAxisId="valor" dataKey="Verbas automáticas" stackId="rescisao" fill={COR_ADMITIDOS} maxBarSize={36} />
              <Bar yAxisId="valor" dataKey="Reclamatória/CCP (manual)" stackId="rescisao" fill={COR_DESLIGADOS} maxBarSize={36} />
              <Line yAxisId="media" type="monotone" dataKey="Custo médio/desligado" stroke={COR_TURNOVER} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>

          <div data-slot="table-container" className="mt-3 overflow-x-auto pr-14 pl-10">
            <table className="w-full table-fixed border-collapse font-mono text-[10px]">
              <colgroup>
                <col className="w-24" />
                {dadosRotatividade.map((d) => (
                  <col key={d.competencia} />
                ))}
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left text-text-3">—</th>
                  {dadosRotatividade.map((d) => (
                    <th key={d.competencia} className="px-2 py-1.5 text-right text-text-3">
                      {d.competencia}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right font-bold text-foreground">Média</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="px-2 py-1.5 text-text-2">Verbas automáticas</td>
                  {dadosRotatividade.map((d) => (
                    <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                      {fmtMoeda(d["Verbas automáticas"])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold text-foreground">
                    {fmtMoeda(media(dadosRotatividade.map((d) => d["Verbas automáticas"])))}
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-2 py-1.5 text-text-2">Reclamatória/CCP (manual)</td>
                  {dadosRotatividade.map((d) => (
                    <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                      {fmtMoeda(d["Reclamatória/CCP (manual)"])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold text-foreground">
                    {fmtMoeda(media(dadosRotatividade.map((d) => d["Reclamatória/CCP (manual)"])))}
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-2 py-1.5 font-bold text-warning">Total</td>
                  {dadosRotatividade.map((d) => (
                    <td key={d.competencia} className="px-2 py-1.5 text-right font-bold text-warning">
                      {fmtMoeda(d.Total)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold text-warning">{fmtMoeda(media(dadosRotatividade.map((d) => d.Total)))}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-2 py-1.5 text-text-2">Desligados (sem aprendiz/transf.)</td>
                  {dadosRotatividade.map((d) => (
                    <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                      {d.Desligados}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold text-foreground">
                    {media(dadosRotatividade.map((d) => d.Desligados)).toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5 font-bold text-foreground">Custo médio/desligado</td>
                  {dadosRotatividade.map((d) => (
                    <td key={d.competencia} className="px-2 py-1.5 text-right font-bold text-foreground">
                      {fmtMoeda(d["Custo médio/desligado"])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold text-foreground">
                    {fmtMoeda(media(dadosRotatividade.map((d) => d["Custo médio/desligado"])))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </ExportCard>
      ),
    },
    {
      id: "operacional-km",
      grupo: "Operacional",
      label: "Custo/Receita por Km rodado",
      descricao: "custo total do empregador ÷ Km rodado, receita bruta ÷ Km rodado e % Folha sobre Receita — vem do lançamento manual de Km/Receita",
      render: () => (
        <ExportCard
          titulo="Custo e Receita por Km rodado"
          descricao="repasse da Prefeitura é em cima do Km rodado — por isso custo e receita são medidos por Km, não só em valor absoluto"
          arquivo="indicadores-operacional"
          csv={{
            headers: ["Competência", "Custo/Km", "Receita/Km", "% Folha/Receita"],
            linhas: dadosOperacional.map((d) => [d.competencia, d["Custo/Km"], d["Receita/Km"], d["% Folha/Receita"]]),
          }}
        >
          {dadosOperacional.length === 0 ? (
            <p className="font-mono text-[11px] text-text-3">
              Nenhum Km rodado/Receita lançado ainda — use o botão &quot;Dados brutos / lançamentos&quot; acima pra lançar por mês.
            </p>
          ) : (
            <>
              <Legenda
                itens={[
                  { cor: COR_ADMITIDOS, label: "Custo/Km" },
                  { cor: COR_DESLIGADOS, label: "Receita/Km" },
                  { cor: COR_TURNOVER, label: "% Folha/Receita" },
                ]}
              />
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dadosOperacional} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
                  <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
                  <YAxis yAxisId="rs" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={56} tickFormatter={fmtMoeda} />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#7590a8" }}
                    stroke="#2a3038"
                    width={48}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, nome) => (nome === "% Folha/Receita" ? `${Number(v).toFixed(2)}%` : fmtMoeda(Number(v)))}
                  />
                  <Bar yAxisId="rs" dataKey="Custo/Km" fill={COR_ADMITIDOS} maxBarSize={28} radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="rs" dataKey="Receita/Km" fill={COR_DESLIGADOS} maxBarSize={28} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="pct" type="monotone" dataKey="% Folha/Receita" stroke={COR_TURNOVER} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>

              <div data-slot="table-container" className="mt-3 overflow-x-auto pr-14 pl-10">
                <table className="w-full table-fixed border-collapse font-mono text-[10px]">
                  <colgroup>
                    <col className="w-24" />
                    {dadosOperacional.map((d) => (
                      <col key={d.competencia} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-1.5 text-left text-text-3">—</th>
                      {dadosOperacional.map((d) => (
                        <th key={d.competencia} className="px-2 py-1.5 text-right text-text-3">
                          {d.competencia}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="px-2 py-1.5 text-text-2">Custo/Km</td>
                      {dadosOperacional.map((d) => (
                        <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                          {fmtMoeda(d["Custo/Km"])}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="px-2 py-1.5 text-text-2">Receita/Km</td>
                      {dadosOperacional.map((d) => (
                        <td key={d.competencia} className="px-2 py-1.5 text-right text-text-2">
                          {fmtMoeda(d["Receita/Km"])}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1.5 font-bold text-warning">% Folha/Receita</td>
                      {dadosOperacional.map((d) => (
                        <td key={d.competencia} className="px-2 py-1.5 text-right font-bold text-warning">
                          {d["% Folha/Receita"].toFixed(2)}%
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </ExportCard>
      ),
    },
    {
      id: "cat",
      grupo: "Segurança do Trabalho",
      label: "Acidentes de Trabalho (CAT)",
      descricao: "acidentes de trabalho (CAT) — típico x trajeto, por área",
      render: () => <AcidentesPainel empresas={empresasCat} empresaId={empresaId} setor={setor} />,
    },
  ];

  const grupos = [...new Set(secoes.map((s) => s.grupo))];
  const secaoAtiva = secoes.find((s) => s.id === indicadorAtivo) ?? secoes[0];

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
          <div className="flex flex-col gap-4 lg:flex-row">
            <nav className="flex shrink-0 flex-col gap-4 lg:w-56">
              {grupos.map((grupo) => (
                <div key={grupo}>
                  <p className="mb-1.5 px-2 font-mono text-[10px] font-bold tracking-[.1em] text-text-3 uppercase">{grupo}</p>
                  <div className="flex flex-col gap-0.5">
                    {secoes
                      .filter((s) => s.grupo === grupo)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setIndicadorAtivo(s.id)}
                          className={`rounded px-2 py-1.5 text-left font-mono text-[11px] tracking-[.02em] transition-colors ${
                            s.id === secaoAtiva.id
                              ? "bg-accent-glow font-bold text-primary"
                              : "text-text-2 hover:bg-white/[.04]"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="min-w-0 flex-1">
              <p className="mb-3 font-mono text-[10px] text-text-3">{secaoAtiva.descricao}</p>
              {secaoAtiva.render()}
            </div>
          </div>

          {podeOperar && (
            <div className="flex flex-col gap-4">
              <Button variant="secondary" onClick={() => setMostrarDadosBrutos((v) => !v)} className="self-start">
                {mostrarDadosBrutos ? "Ocultar dados brutos / lançamentos" : "Dados brutos / lançamentos"}
              </Button>

              {mostrarDadosBrutos && (
                <>
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <p className="mb-1 font-mono text-[13px] font-bold text-foreground">Lançamento total (por empresa)</p>
                    <p className="mb-3 font-mono text-[10px] text-text-3">
                      escolha o lançamento e o mês, informe o valor total pago pela empresa — o rateio por área (ativos da área ÷
                      total de ativos × valor total) é automático e aparece na coluna correspondente da tabela abaixo
                    </p>
                    {empresaId === TODOS ? (
                      <p className="font-mono text-[11px] text-warning">Selecione uma empresa específica no filtro do topo para editar.</p>
                    ) : (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-2">
                          <Label>Lançamento</Label>
                          <Select value={campoRateioSelecionado} onValueChange={(v) => setCampoRateioSelecionado(v as CampoRateio)}>
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RATEIO_CAMPOS.map((campo) => (
                                <SelectItem key={campo} value={campo}>
                                  {CAMPO_LABEL[campo]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>Competência</Label>
                          <Select value={competenciaRateio ?? undefined} onValueChange={(v) => setCompetenciaRateioSelecionada(v as string)}>
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {competenciasTabela.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {nomeCompetencia(c)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>Valor total (R$)</Label>
                          <Input
                            value={valorRateio}
                            disabled={carregandoRateio || salvandoRateio}
                            onChange={(e) => setValorRateio(e.target.value)}
                            className="w-36"
                          />
                        </div>
                        <Button onClick={handleSalvarRateio} disabled={carregandoRateio || salvandoRateio || !competenciaRateio}>
                          {salvandoRateio ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-surface p-4">
                    <p className="mb-1 font-mono text-[13px] font-bold text-foreground">Km rodado e Receita (por empresa)</p>
                    <p className="mb-3 font-mono text-[10px] text-text-3">
                      base dos indicadores de Custo/Receita por Km e da CPRB (empresas com desoneração da folha)
                    </p>
                    {empresaId === TODOS ? (
                      <p className="font-mono text-[11px] text-warning">Selecione uma empresa específica no filtro do topo para editar.</p>
                    ) : (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-2">
                          <Label>Competência</Label>
                          <Select value={competenciaOperacao ?? undefined} onValueChange={(v) => setCompetenciaOperacaoSelecionada(v as string)}>
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {competenciasTabela.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {nomeCompetencia(c)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <FormularioOperacao
                          key={`${empresaId}|${competenciaOperacao}`}
                          kmInicial={registroOperacao ? String(registroOperacao.kmRodado) : ""}
                          receitaInicial={registroOperacao ? String(registroOperacao.receita) : ""}
                          salvando={salvandoOperacao}
                          onSalvar={handleSalvarOperacao}
                        />
                      </div>
                    )}
                  </div>

                  <ExportCard
                    titulo="Tabela detalhada — editável"
                    descricao="clique num valor pra corrigir; grava assim que sai do campo"
                    arquivo="indicadores-detalhado"
                    pdfHref={`/admin/indicadores/resumo-pdf?${queryString}`}
                    csv={{ headers: csvHeaders, linhas: csvLinhas }}
                    csvLista={{ headers: csvListaHeaders, linhas: csvListaLinhas }}
                  >
                    <div className="mb-3 flex flex-col gap-2">
                      <Label>Competência</Label>
                      <Select value={competenciaTabela} onValueChange={(v) => setCompetenciaTabela(v as string)}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TODOS}>Todas</SelectItem>
                          {competenciasTabela.map((c) => (
                            <SelectItem key={c} value={c}>
                              {nomeCompetencia(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Table containerClassName="max-h-[70vh] overflow-y-auto">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Área</TableHead>
                          <TableHead>Competência</TableHead>
                          {CAMPOS_TABELA.map((c) => (
                            <TableHead key={c}>{CAMPO_LABEL[c]}</TableHead>
                          ))}
                          <TableHead>IRRF do mês (R$)</TableHead>
                          <TableHead>% Encargos</TableHead>
                          <TableHead>Rotatividade %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dadosTabela.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell>{l.empresaNome}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap text-foreground">{labelSetor(l.setor)}</TableCell>
                            <TableCell>{nomeCompetencia(l.competencia)}</TableCell>
                            {CAMPOS_TABELA.map((c) =>
                              RATEIO_CAMPOS.includes(c as CampoRateio) ? (
                                <TableCell
                                  key={c}
                                  className="text-text-2"
                                  title={`Rateado do total da empresa (R$ ${l.totaisRateio[c as CampoRateio].toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) — edite o total acima, não esta célula`}
                                >
                                  {l[c].toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </TableCell>
                              ) : (
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
                              )
                            )}
                            <TableCell title="IRRF férias desta competência + IRRF normal da competência anterior">
                              {l.irrf.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>{l.percentualEncargos.toFixed(1)}%</TableCell>
                            <TableCell>{l.taxaRotatividade.toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                        {dadosTabela.length > 0 && (
                          <TableRow>
                            <TableCell className="font-bold text-foreground">Total</TableCell>
                            <TableCell />
                            <TableCell />
                            {CAMPOS_TABELA.map((c) => (
                              <TableCell key={c} className="font-bold text-foreground">
                                {dadosTabela.reduce((soma, l) => soma + l[c], 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </TableCell>
                            ))}
                            <TableCell className="font-bold text-foreground">
                              {dadosTabela.reduce((soma, l) => soma + l.irrf, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>—</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ExportCard>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
