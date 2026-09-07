"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

function pivotTurnover(linhas: LinhaComDerivados[]) {
  const porCompetencia = new Map<string, { Admitidos: number; Desligados: number }>();
  for (const l of linhas) {
    const bucket = porCompetencia.get(l.competencia) ?? { Admitidos: 0, Desligados: 0 };
    bucket.Admitidos += l.admitidos;
    bucket.Desligados += l.desligados;
    porCompetencia.set(l.competencia, bucket);
  }
  return [...porCompetencia.entries()]
    .sort((a, b) => chaveCompetencia(a[0]) - chaveCompetencia(b[0]))
    .map(([competencia, valores]) => ({ competencia: nomeCompetencia(competencia), ...valores }));
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
  const [carregando, startCarregando] = useTransition();
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  function carregar(overrides: { empresaId?: string; setor?: string }) {
    const e = overrides.empresaId ?? empresaId;
    const s = overrides.setor ?? setor;
    startCarregando(async () => {
      const result = await carregarIndicadores({
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
  const dadosCusto = useMemo(() => pivotPorArea(dados, "custoTotalEmpregador"), [dados]);
  const dadosTurnover = useMemo(() => pivotTurnover(dados), [dados]);
  const dadosAbsenteismo = useMemo(() => pivotPorArea(dados, "diasAusencia"), [dados]);
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
            titulo="Turnover — admissões x desligamentos"
            descricao="soma do período/filtro selecionado"
            arquivo="indicadores-turnover"
            csv={{
              headers: ["Competência", "Admitidos", "Desligados"],
              linhas: dadosTurnover.map((d) => [d.competencia, d.Admitidos, d.Desligados]),
            }}
          >
            <Legenda itens={[{ cor: COR_ADMITIDOS, label: "Admitidos" }, { cor: COR_DESLIGADOS, label: "Desligados" }]} />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dadosTurnover} margin={{ left: 8, right: 24, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
                <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
                <YAxis tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="Admitidos" fill={COR_ADMITIDOS} maxBarSize={28} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Desligados" fill={COR_DESLIGADOS} maxBarSize={28} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
            titulo="Custo de benefícios por área"
            descricao="cesta básica + alimentação + vale-gás"
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
