"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Printer, CalendarPlus, FileDown, AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { salvarProgramacao, salvarQuinzena } from "./actions";
import { Importador } from "./importador";
import { dataPagamentoFerias } from "@/lib/feriados";

export type QuinzenaLinha = {
  ano: number;
  mes: number;
  quinzena: number;
  dataInicio: string;
  dataFim: string;
};

export type FeriasLinha = {
  id: string;
  matricula: string;
  nome: string;
  funcao: string;
  departamento: string | null;
  setor: string | null;
  empresa: string;
  salario: number;
  periodoAquisitivoFim: string;
  dataLimite: string;
  meses: number;
  faltas: number;
  diasDireito: number;
  mes: number | null;
  ano: number | null;
  quinzena: number | null;
  diasAbono: number;
  abonoTipo: "inicio" | "final" | null;
  gozoInicio: string | null;
  gozoFim: string | null;
  dataPagamento: string | null;
  status: "pendente" | "programado" | "concluido";
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const ANOS = [2026, 2027, 2028, 2029];

function ultimoDiaDoMes(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function formatarData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcularValorAproximado(salario: number, diasGozo: number) {
  return (salario / 30) * diasGozo * 1.333 * 1.2;
}

function statusBadge(status: "pendente" | "programado" | "concluido") {
  const cfg = {
    pendente: { label: "Não programado", cls: "text-text-3 bg-bg-4 border-border" },
    programado: { label: "Programado", cls: "text-primary bg-accent-glow border-primary/30" },
    concluido: { label: "Concluído", cls: "text-success bg-success-dim border-success/30" },
  }[status];
  return (
    <span className={`rounded-[3px] border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[.06em] uppercase ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// -----------------------------------------------------------------------
// Diálogo de programação — um período por vez, com prévia grande das datas.
// -----------------------------------------------------------------------
function ProgramarDialog({
  periodo,
  quinzenas,
  onSaved,
}: {
  periodo: FeriasLinha;
  quinzenas: QuinzenaLinha[];
  onSaved: (p: FeriasLinha) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(periodo.mes ?? 0);
  const [ano, setAno] = useState(periodo.ano ?? new Date(periodo.dataLimite).getUTCFullYear());
  const [quinzena, setQuinzena] = useState(periodo.quinzena ?? 0);
  const [diasAbono, setDiasAbono] = useState(periodo.diasAbono);
  const [abonoTipo, setAbonoTipo] = useState<"inicio" | "final" | "">(periodo.abonoTipo ?? "");
  const [isPending, startTransition] = useTransition();

  const maxAbono = Math.floor(periodo.diasDireito / 3);
  const diasGozo = periodo.diasDireito - diasAbono;

  const quinzenaCustom = quinzenas.find((q) => q.ano === ano && q.mes === mes && q.quinzena === quinzena);

  const gozoInicioPreview = useMemo(() => {
    if (!mes || !ano || !quinzena) return null;
    let d: Date;
    if (quinzenaCustom) {
      d = new Date(quinzenaCustom.dataInicio);
    } else {
      const dia = quinzena === 2 ? 16 : 1;
      d = new Date(Date.UTC(ano, mes - 1, dia));
    }
    if (abonoTipo === "inicio" && diasAbono > 0) d = new Date(d.getTime() + diasAbono * 86_400_000);
    return d;
  }, [mes, ano, quinzena, abonoTipo, diasAbono, quinzenaCustom]);
  const gozoFimPreview = gozoInicioPreview
    ? new Date(gozoInicioPreview.getTime() + (diasGozo - 1) * 86_400_000)
    : null;
  const pagamentoPreview = gozoInicioPreview ? dataPagamentoFerias(gozoInicioPreview) : null;

  function salvar() {
    if (!mes || !ano || !quinzena) {
      toast.error("Escolha o mês, o ano e a quinzena.");
      return;
    }
    if (diasAbono > 0 && !abonoTipo) {
      toast.error("Escolha se o abono fica no início ou no final do período de gozo.");
      return;
    }
    startTransition(async () => {
      const result = await salvarProgramacao({
        feriasId: periodo.id,
        mes,
        ano,
        quinzena,
        diasAbono,
        abonoTipo: diasAbono > 0 ? (abonoTipo || null) : null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Programação de ${periodo.nome} salva.`);
      onSaved({
        ...periodo,
        mes,
        ano,
        quinzena,
        diasAbono,
        abonoTipo: diasAbono > 0 ? (abonoTipo || null) : null,
        gozoInicio: gozoInicioPreview?.toISOString() ?? null,
        gozoFim: gozoFimPreview?.toISOString() ?? null,
        status: "programado",
      });
      setOpen(false);
    });
  }

  function labelQuinzena(num: 1 | 2) {
    const custom = mes ? quinzenas.find((q) => q.ano === ano && q.mes === mes && q.quinzena === num) : undefined;
    if (custom) {
      return `${num}ª quinzena — ${formatarData(custom.dataInicio)} a ${formatarData(custom.dataFim)}`;
    }
    if (num === 1) return "1ª quinzena — dia 01 a 15 (padrão, sem data personalizada)";
    return mes
      ? `2ª quinzena — dia 16 a ${ultimoDiaDoMes(ano, mes)} (padrão, sem data personalizada)`
      : "2ª quinzena — dia 16 ao fim do mês";
  }
  const labelQuinzena1 = labelQuinzena(1);
  const labelQuinzena2 = labelQuinzena(2);

  const selectCls =
    "h-9 w-full rounded-sm border border-border-hi bg-secondary px-2.5 font-mono text-[12px] text-foreground outline-none focus-visible:border-primary";
  const labelCls = "mb-1 block font-mono text-[10px] font-bold tracking-[.06em] text-text-3 uppercase";

  function handleOpenChange(v: boolean) {
    if (v) {
      // Sempre parte dos dados salvos mais recentes ao abrir — evita mostrar uma edição antiga
      // que foi cancelada numa sessão anterior sem ter sido salva.
      setMes(periodo.mes ?? 0);
      setAno(periodo.ano ?? new Date(periodo.dataLimite).getUTCFullYear());
      setQuinzena(periodo.quinzena ?? 0);
      setDiasAbono(periodo.diasAbono);
      setAbonoTipo(periodo.abonoTipo ?? "");
    }
    setOpen(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" variant={periodo.gozoInicio ? "secondary" : "default"}>
            <CalendarPlus className="size-3.5" />
            {periodo.gozoInicio ? "Editar" : "Programar"}
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Programar férias — {periodo.nome}</DialogTitle>
          <DialogDescription>
            Matrícula {periodo.matricula} · {periodo.funcao} · {periodo.faltas} falta(s) no período →{" "}
            <span className="font-bold text-primary">{periodo.diasDireito} dias de direito</span> · limite para
            iniciar o gozo: <span className="font-bold text-foreground">{formatarData(periodo.dataLimite)}</span>
            {periodo.gozoInicio && (
              <>
                <br />
                Já programado — pode alterar mês, quinzena e abono quantas vezes precisar, é só salvar de novo.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Mês de férias</label>
              <select className={selectCls} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                <option value={0}>Selecione...</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Ano</label>
              <select className={selectCls} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                {ANOS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Quinzena</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setQuinzena(1)}
                className={`rounded-sm border px-3 py-2.5 text-left font-mono text-[11px] transition-colors ${
                  quinzena === 1
                    ? "border-primary bg-accent-glow text-primary"
                    : "border-border-hi bg-secondary text-text-2 hover:border-primary/50"
                }`}
              >
                {labelQuinzena1}
              </button>
              <button
                type="button"
                onClick={() => setQuinzena(2)}
                className={`rounded-sm border px-3 py-2.5 text-left font-mono text-[11px] transition-colors ${
                  quinzena === 2
                    ? "border-primary bg-accent-glow text-primary"
                    : "border-border-hi bg-secondary text-text-2 hover:border-primary/50"
                }`}
              >
                {labelQuinzena2}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Abono pecuniário (venda de até 1/3 das férias)</label>
            <div className="grid grid-cols-2 gap-3">
              <select
                className={selectCls}
                value={diasAbono}
                onChange={(e) => setDiasAbono(Number(e.target.value))}
              >
                <option value={0}>Sem abono</option>
                {maxAbono >= 10 && <option value={10}>10 dias de abono</option>}
              </select>
              <select
                className={selectCls}
                value={abonoTipo}
                disabled={diasAbono === 0}
                onChange={(e) => setAbonoTipo(e.target.value as "inicio" | "final" | "")}
              >
                <option value="">Início ou final?</option>
                <option value="inicio">No início do gozo</option>
                <option value="final">No final do gozo</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-primary/30 bg-accent-glow p-4">
            <p className="mb-3 font-mono text-[10px] font-bold tracking-[.06em] text-primary uppercase">
              Prévia da programação
            </p>
            {gozoInicioPreview && gozoFimPreview ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] text-text-2">Início do gozo</span>
                  <span className="font-mono text-lg font-bold text-foreground">
                    {gozoInicioPreview.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] text-text-2">Fim do gozo</span>
                  <span className="font-mono text-lg font-bold text-foreground">
                    {gozoFimPreview.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </span>
                </div>
                <div className="my-1 h-px bg-primary/20" />
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] text-text-2">Dias de gozo</span>
                  <span className="font-mono text-[13px] font-bold text-foreground">{diasGozo} dias</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] text-text-2">Pagar até</span>
                  <span className="font-mono text-[13px] font-bold text-foreground">
                    {pagamentoPreview?.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] text-text-2">Valor aproximado</span>
                  <span className="font-mono text-[13px] font-bold text-foreground">
                    {formatarMoeda(calcularValorAproximado(periodo.salario, diasGozo))}
                  </span>
                </div>
              </div>
            ) : (
              <p className="font-mono text-[11px] text-text-3">Escolha o mês, ano e quinzena para ver as datas.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar programação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------
// Calendário de quinzenas — referência fixa de datas por mês/ano.
// -----------------------------------------------------------------------
function dataParaInput(iso: string) {
  return iso.slice(0, 10);
}

function QuinzenaCelulaEditavel({
  ano,
  mes,
  quinzena,
  custom,
  onSaved,
}: {
  ano: number;
  mes: number;
  quinzena: 1 | 2;
  custom: QuinzenaLinha | undefined;
  onSaved: (q: QuinzenaLinha) => void;
}) {
  const padraoInicio = custom
    ? custom.dataInicio
    : new Date(Date.UTC(ano, mes - 1, quinzena === 2 ? 16 : 1)).toISOString();
  const padraoFim = custom
    ? custom.dataFim
    : new Date(Date.UTC(ano, mes - 1, quinzena === 2 ? ultimoDiaDoMes(ano, mes) : 15)).toISOString();

  const [dataInicio, setDataInicio] = useState(dataParaInput(padraoInicio));
  const [dataFim, setDataFim] = useState(dataParaInput(padraoFim));
  const [isPending, startTransition] = useTransition();

  function alterarInicio(novoInicio: string) {
    setDataInicio(novoInicio);
    // Sempre que o início muda, recalcula o fim automaticamente pra um ciclo de 30 dias corridos
    // (05/01 → 03/02, por exemplo) — ainda dá pra ajustar o fim manualmente depois, se precisar.
    const d = new Date(novoInicio + "T00:00:00.000Z");
    if (!Number.isNaN(d.getTime())) {
      setDataFim(dataParaInput(new Date(d.getTime() + 29 * 86_400_000).toISOString()));
    }
  }

  const pagamento = (() => {
    const d = new Date(dataInicio + "T00:00:00.000Z");
    if (Number.isNaN(d.getTime())) return null;
    return dataPagamentoFerias(d);
  })();

  function salvar() {
    startTransition(async () => {
      const result = await salvarQuinzena({
        ano,
        mes,
        quinzena,
        dataInicio: new Date(dataInicio + "T00:00:00.000Z").toISOString(),
        dataFim: new Date(dataFim + "T00:00:00.000Z").toISOString(),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${quinzena}ª quinzena de ${MESES[mes - 1]}/${ano} salva.`);
      onSaved({
        ano,
        mes,
        quinzena,
        dataInicio: new Date(dataInicio + "T00:00:00.000Z").toISOString(),
        dataFim: new Date(dataFim + "T00:00:00.000Z").toISOString(),
      });
    });
  }

  const inputCls =
    "h-7 rounded-sm border border-border-hi bg-secondary px-1.5 font-mono text-[10px] text-foreground outline-none focus-visible:border-primary";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input type="date" className={inputCls} value={dataInicio} onChange={(e) => alterarInicio(e.target.value)} />
        <span className="text-text-3">a</span>
        <input type="date" className={inputCls} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        <Button size="xs" variant="secondary" onClick={salvar} disabled={isPending}>
          {isPending ? "..." : "Salvar"}
        </Button>
        {!custom && <span className="font-mono text-[9px] text-text-3">(padrão)</span>}
      </div>
      {pagamento && (
        <span className="font-mono text-[9px] text-text-3">
          pagar até {pagamento.toLocaleDateString("pt-BR", { timeZone: "UTC" })} (dia útil)
        </span>
      )}
    </div>
  );
}

function CalendarioQuinzenas({
  quinzenas,
  onSaved,
}: {
  quinzenas: QuinzenaLinha[];
  onSaved: (q: QuinzenaLinha) => void;
}) {
  const [ano, setAno] = useState(new Date().getFullYear());
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <label className="font-mono text-[11px] text-text-3">Ano:</label>
        <select
          className="h-8 rounded-sm border border-border-hi bg-secondary px-2 font-mono text-[11px] text-foreground"
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
        >
          {ANOS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <p className="font-mono text-[10px] text-text-3">
          edite as datas de início/fim de cada quinzena e clique em Salvar — quem não editar continua
          usando o padrão (dia 1 a 15 / dia 16 ao fim do mês)
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead>1ª Quinzena</TableHead>
            <TableHead>2ª Quinzena</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MESES.map((nome, i) => {
            const mes = i + 1;
            const custom1 = quinzenas.find((q) => q.ano === ano && q.mes === mes && q.quinzena === 1);
            const custom2 = quinzenas.find((q) => q.ano === ano && q.mes === mes && q.quinzena === 2);
            return (
              <TableRow key={nome}>
                <TableCell className="font-medium text-foreground capitalize whitespace-nowrap">{nome}</TableCell>
                <TableCell>
                  <QuinzenaCelulaEditavel ano={ano} mes={mes} quinzena={1} custom={custom1} onSaved={onSaved} />
                </TableCell>
                <TableCell>
                  <QuinzenaCelulaEditavel ano={ano} mes={mes} quinzena={2} custom={custom2} onSaved={onSaved} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: string[][]) {
  const conteudo = [cabecalho, ...linhas]
    .map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

const COR_PROGRAMADOS = "#0d9488";
const COR_PENDENTES = "#7590a8";
const COR_VALOR = "#3b82f6";
const TOOLTIP_STYLE = {
  background: "#131619",
  border: "1px solid #2a3038",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "#e2e8f0",
};

type Filtro = { empresa: string; area: string; departamento: string; mes: number; ano: number };

function useFiltro(base: FeriasLinha[]) {
  const [empresa, setEmpresa] = useState("");
  const [area, setArea] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [mes, setMes] = useState(0);
  const [ano, setAno] = useState(0);
  const filtrados = useMemo(
    () =>
      base.filter(
        (p) =>
          (!empresa || p.empresa === empresa) &&
          (!area || (p.setor ?? "Não classificado") === area) &&
          (!departamento || (p.departamento ?? "Não classificado") === departamento) &&
          (!mes || p.mes === mes) &&
          (!ano || p.ano === ano)
      ),
    [base, empresa, area, departamento, mes, ano]
  );
  return { empresa, setEmpresa, area, setArea, departamento, setDepartamento, mes, setMes, ano, setAno, filtrados };
}

function FiltroBar({
  empresas,
  areas,
  departamentos,
  filtro,
  mostrarDepartamento = false,
  mostrarAno = false,
}: {
  empresas: string[];
  areas: string[];
  departamentos?: string[];
  filtro: Filtro & {
    setEmpresa: (v: string) => void;
    setArea: (v: string) => void;
    setDepartamento: (v: string) => void;
    setMes: (v: number) => void;
    setAno: (v: number) => void;
  };
  mostrarDepartamento?: boolean;
  mostrarAno?: boolean;
}) {
  const selectCls =
    "h-8 rounded-sm border border-border-hi bg-secondary px-2 font-mono text-[11px] text-foreground outline-none focus-visible:border-primary";
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <select className={selectCls} value={filtro.empresa} onChange={(e) => filtro.setEmpresa(e.target.value)}>
        <option value="">Todas as empresas</option>
        {empresas.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>
      <select className={selectCls} value={filtro.area} onChange={(e) => filtro.setArea(e.target.value)}>
        <option value="">Todas as áreas</option>
        {areas.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      {mostrarDepartamento && (
        <select
          className={selectCls}
          value={filtro.departamento}
          onChange={(e) => filtro.setDepartamento(e.target.value)}
        >
          <option value="">Todos os departamentos</option>
          {(departamentos ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      )}
      <select className={selectCls} value={filtro.mes} onChange={(e) => filtro.setMes(Number(e.target.value))}>
        <option value={0}>Todos os meses</option>
        {MESES.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      {mostrarAno && (
        <select className={selectCls} value={filtro.ano} onChange={(e) => filtro.setAno(Number(e.target.value))}>
          <option value={0}>Todos os anos</option>
          {ANOS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function FeriasTable({
  periodos: periodosIniciais,
  quinzenasIniciais,
}: {
  periodos: FeriasLinha[];
  quinzenasIniciais: QuinzenaLinha[];
}) {
  const [periodos, setPeriodos] = useState(periodosIniciais);
  const [quinzenas, setQuinzenas] = useState(quinzenasIniciais);

  function atualizarPeriodo(atualizado: FeriasLinha) {
    setPeriodos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)));
  }

  function atualizarQuinzena(atualizada: QuinzenaLinha) {
    setQuinzenas((prev) => {
      const existe = prev.some(
        (q) => q.ano === atualizada.ano && q.mes === atualizada.mes && q.quinzena === atualizada.quinzena
      );
      if (existe) {
        return prev.map((q) =>
          q.ano === atualizada.ano && q.mes === atualizada.mes && q.quinzena === atualizada.quinzena
            ? atualizada
            : q
        );
      }
      return [...prev, atualizada];
    });
  }

  const programados = periodos.filter((p) => !!p.gozoInicio);
  const alertaVencendo = periodos.filter((p) => !p.gozoInicio && p.meses >= 21);
  const naoProgramados = periodos.filter((p) => !p.gozoInicio);

  const [busca, setBusca] = useState("");
  const filtroProgramacao = useFiltro(periodos);
  const periodosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return filtroProgramacao.filtrados;
    return filtroProgramacao.filtrados.filter(
      (p) => p.matricula.toLowerCase().includes(termo) || p.nome.toLowerCase().includes(termo)
    );
  }, [filtroProgramacao.filtrados, busca]);

  const empresas = useMemo(() => [...new Set(periodos.map((p) => p.empresa))].sort(), [periodos]);
  const areas = useMemo(
    () => [...new Set(periodos.map((p) => p.setor ?? "Não classificado"))].sort(),
    [periodos]
  );
  const departamentos = useMemo(
    () => [...new Set(periodos.map((p) => p.departamento ?? "Não classificado"))].sort(),
    [periodos]
  );

  const filtroMural = useFiltro(programados);
  const empresaMural = useMemo(() => {
    if (filtroMural.empresa) return filtroMural.empresa;
    const empresasNoFiltro = new Set(filtroMural.filtrados.map((p) => p.empresa));
    if (empresasNoFiltro.size === 1) return [...empresasNoFiltro][0];
    return "Todas as empresas";
  }, [filtroMural.empresa, filtroMural.filtrados]);
  const filtroResumo = useFiltro(periodos);

  const porArea = useMemo(() => {
    const mapa = new Map<string, { programados: number; total: number }>();
    for (const p of filtroResumo.filtrados) {
      const chave = p.setor ?? "Não classificado";
      const atual = mapa.get(chave) ?? { programados: 0, total: 0 };
      atual.total++;
      if (p.gozoInicio) atual.programados++;
      mapa.set(chave, atual);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtroResumo.filtrados]);

  const porMesQuinzena = useMemo(() => {
    const mapa = new Map<
      string,
      { mes: number; ano: number; quinzena: number; qtd: number; valor: number }
    >();
    for (const p of filtroResumo.filtrados) {
      if (!p.mes || !p.ano || !p.quinzena || !p.gozoInicio) continue;
      const chave = `${p.ano}-${p.mes}-${p.quinzena}`;
      const atual = mapa.get(chave) ?? { mes: p.mes, ano: p.ano, quinzena: p.quinzena, qtd: 0, valor: 0 };
      atual.qtd++;
      atual.valor += calcularValorAproximado(p.salario, p.diasDireito - p.diasAbono);
      mapa.set(chave, atual);
    }
    return [...mapa.values()]
      .sort((a, b) => a.ano - b.ano || a.mes - b.mes || a.quinzena - b.quinzena)
      .map((v) => {
        const custom = quinzenas.find((q) => q.ano === v.ano && q.mes === v.mes && q.quinzena === v.quinzena);
        const gozoInicio = custom
          ? new Date(custom.dataInicio)
          : new Date(Date.UTC(v.ano, v.mes - 1, v.quinzena === 2 ? 16 : 1));
        return { ...v, gozoInicio, dataPagamento: dataPagamentoFerias(gozoInicio) };
      });
  }, [filtroResumo.filtrados, quinzenas]);

  const porMes = useMemo(() => {
    const mapa = new Map<string, { qtd: number; valor: number }>();
    for (const v of porMesQuinzena) {
      const chave = `${MESES[v.mes - 1]}/${v.ano}`;
      const atual = mapa.get(chave) ?? { qtd: 0, valor: 0 };
      atual.qtd += v.qtd;
      atual.valor += v.valor;
      mapa.set(chave, atual);
    }
    return [...mapa.entries()];
  }, [porMesQuinzena]);

  const valorPorQuinzena = useMemo(() => {
    let quinzena1 = 0;
    let quinzena2 = 0;
    for (const p of filtroResumo.filtrados) {
      if (!p.gozoInicio || !p.quinzena) continue;
      const valor = calcularValorAproximado(p.salario, p.diasDireito - p.diasAbono);
      if (p.quinzena === 1) quinzena1 += valor;
      else quinzena2 += valor;
    }
    return { quinzena1, quinzena2, total: quinzena1 + quinzena2 };
  }, [filtroResumo.filtrados]);

  function exportarEnvioGestores() {
    baixarCsv(
      "envio_gestores_ferias.csv",
      ["Matrícula", "Nome", "Departamento", "Limite", "Mês", "1ª Quinz.", "2ª Quinz.", "Gozo Inicial", "Gozo Final"],
      filtroMural.filtrados.map((p) => [
        p.matricula,
        p.nome,
        p.departamento ?? "",
        formatarData(p.dataLimite),
        p.mes ? `${MESES[p.mes - 1]}/${p.ano}` : "",
        p.quinzena === 1 ? "X" : "",
        p.quinzena === 2 ? "X" : "",
        formatarData(p.gozoInicio),
        formatarData(p.gozoFim),
      ])
    );
  }

  function exportarResumoCsv() {
    baixarCsv(
      "resumo_ferias_por_mes_quinzena.csv",
      ["Mês", "Ano", "Quinzena", "Quantidade", "Valor Aproximado", "Início do Gozo", "Data de Pagamento"],
      porMesQuinzena.map((v) => [
        MESES[v.mes - 1],
        String(v.ano),
        `${v.quinzena}ª quinzena`,
        String(v.qtd),
        v.valor.toFixed(2),
        v.gozoInicio.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
        v.dataPagamento.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      ])
    );
  }

  return (
    <Tabs defaultValue="programacao" className="flex flex-col gap-4">
      <style>{`@media print { @page { size: landscape; } }`}</style>
      <TabsList className="print:hidden">
        <TabsTab value="programacao">Programação</TabsTab>
        <TabsTab value="importar">Importar TXT</TabsTab>
        <TabsTab value="calendario">Calendário de Quinzenas</TabsTab>
        <TabsTab value="resumo">Resumo</TabsTab>
        <TabsTab value="mural">Painel / Mural</TabsTab>
        <TabsIndicator />
      </TabsList>

      <TabsPanel value="programacao" className="flex flex-col gap-3">
        {periodos.length === 0 ? (
          <p className="font-mono text-[11px] text-text-3">
            Nenhum período de férias importado ainda. Vá para a aba &quot;Importar TXT&quot; e envie o relatório do
            ERP primeiro.
          </p>
        ) : (
          <>
            {alertaVencendo.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-sm border border-danger/40 bg-danger/10 px-3.5 py-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                <div className="flex flex-col gap-1">
                  <p className="font-mono text-[11px] font-bold tracking-[.04em] text-danger uppercase">
                    {alertaVencendo.length} colaborador(es) com 21+ meses vencidos — programar com urgência
                  </p>
                  <p className="font-mono text-[10px] text-text-2">
                    {alertaVencendo.map((p) => p.nome).slice(0, 8).join(" · ")}
                    {alertaVencendo.length > 8 && ` · +${alertaVencendo.length - 8}`}
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  placeholder="Buscar por matrícula ou nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-8 w-64 rounded-sm border border-border-hi bg-secondary px-2.5 font-mono text-[11px] text-foreground outline-none placeholder:text-text-3 focus-visible:border-primary"
                />
                <FiltroBar
                  empresas={empresas}
                  areas={areas}
                  departamentos={departamentos}
                  filtro={filtroProgramacao}
                  mostrarDepartamento
                />
              </div>
              <div className="flex gap-2">
                <a
                  href={`/admin/ferias/programacao-pdf?${new URLSearchParams({
                    ...(busca && { busca }),
                    ...(filtroProgramacao.empresa && { empresa: filtroProgramacao.empresa }),
                    ...(filtroProgramacao.area && { area: filtroProgramacao.area }),
                    ...(filtroProgramacao.departamento && { departamento: filtroProgramacao.departamento }),
                    ...(filtroProgramacao.mes && { mes: String(filtroProgramacao.mes) }),
                  }).toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="secondary">
                    <FileDown className="size-3.5" />
                    Exportar PDF
                  </Button>
                </a>
                <Button size="sm" variant="secondary" onClick={exportarEnvioGestores}>
                  <Download className="size-3.5" />
                  Exportar CSV p/ gestores
                </Button>
              </div>
            </div>
            <p className="font-mono text-[10px] text-text-3">
              {periodosFiltrados.length} de {periodos.length} período(s) · {programados.length} programado(s) ·{" "}
              {naoProgramados.length} pendente(s) — clique em{" "}
              <span className="font-bold text-primary">Programar/Editar</span> na linha do colaborador pra lançar ou
              alterar mês, quinzena e abono a qualquer momento
            </p>
            <Table containerClassName="max-h-[70vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Depto</TableHead>
                  <TableHead>Faltas</TableHead>
                  <TableHead>Dias</TableHead>
                  <TableHead>Meses vencido</TableHead>
                  <TableHead>Limite</TableHead>
                  <TableHead>Mês programado</TableHead>
                  <TableHead>Gozo Ini.</TableHead>
                  <TableHead>Gozo Fim</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodosFiltrados.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.matricula}</TableCell>
                    <TableCell className="font-medium text-foreground whitespace-nowrap">{p.nome}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.departamento ?? "—"}</TableCell>
                    <TableCell className="text-center">{p.faltas}</TableCell>
                    <TableCell className="text-center font-medium text-foreground">{p.diasDireito}</TableCell>
                    <TableCell
                      className={`text-center ${p.meses >= 21 ? "font-bold text-danger" : ""}`}
                    >
                      {p.meses}
                      {p.meses >= 21 && <AlertTriangle className="ml-1 inline size-3 text-danger" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(p.dataLimite)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.mes ? `${MESES[p.mes - 1]}/${p.ano} · ${p.quinzena}ª quinz.` : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(p.gozoInicio)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(p.gozoFim)}</TableCell>
                    <TableCell>{statusBadge(p.gozoInicio ? "programado" : "pendente")}</TableCell>
                    <TableCell>
                      <ProgramarDialog periodo={p} quinzenas={quinzenas} onSaved={atualizarPeriodo} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </TabsPanel>

      <TabsPanel value="importar">
        <Importador />
      </TabsPanel>

      <TabsPanel value="calendario" className="flex flex-col gap-3">
        <p className="font-mono text-[11px] text-text-3">
          Referência fixa: 1ª quinzena sempre do dia 1 ao 15; 2ª quinzena do dia 16 até o último dia do mês
          (ajusta sozinho para meses de 28 a 31 dias).
        </p>
        <CalendarioQuinzenas quinzenas={quinzenas} onSaved={atualizarQuinzena} />
      </TabsPanel>

      <TabsPanel value="resumo" className="flex flex-col gap-6">
        <FiltroBar empresas={empresas} areas={areas} filtro={filtroResumo} mostrarAno />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
            <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">1ª Quinzena</span>
            <span className="font-mono text-[18px] leading-none font-bold text-foreground">
              {formatarMoeda(valorPorQuinzena.quinzena1)}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
            <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">2ª Quinzena</span>
            <span className="font-mono text-[18px] leading-none font-bold text-foreground">
              {formatarMoeda(valorPorQuinzena.quinzena2)}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-sm border border-primary/30 bg-accent-glow px-4 py-3">
            <span className="font-mono text-[10px] tracking-[.06em] text-primary uppercase">Total programado</span>
            <span className="font-mono text-[18px] leading-none font-bold text-primary">
              {formatarMoeda(valorPorQuinzena.total)}
            </span>
          </div>
        </div>

        <div>
          <h3 className="mb-2 font-mono text-[11px] font-bold tracking-[.06em] text-text-2 uppercase">
            Programados por Área
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(120, porArea.length * 40)}>
            <BarChart data={porArea.map(([nome, v]) => ({ nome, ...v }))} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" />
              <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="programados" name="Programados" stackId="a" fill={COR_PROGRAMADOS} maxBarSize={22} />
              <Bar
                dataKey="total"
                name="Total"
                fill={COR_PENDENTES}
                radius={[0, 4, 4, 0]}
                maxBarSize={22}
                // total já inclui os programados — mostrado como referência ao lado, não empilhado
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3 className="mb-2 font-mono text-[11px] font-bold tracking-[.06em] text-text-2 uppercase">
            Valor aproximado por Mês
          </h3>
          {porMes.length === 0 ? (
            <p className="font-mono text-[11px] text-text-3">Nenhum período programado no filtro atual.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, porMes.length * 36)}>
              <BarChart
                data={porMes.map(([nome, v]) => ({ nome, ...v }))}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" />
                <YAxis type="category" dataKey="nome" width={90} tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatarMoeda(Number(v))} />
                <Bar dataKey="valor" name="Valor aproximado" fill={COR_VALOR} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div>
          <h3 className="mb-2 font-mono text-[11px] font-bold tracking-[.06em] text-text-2 uppercase">Por Área</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Área</TableHead>
                <TableHead>Programados</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porArea.map(([nome, v]) => (
                <TableRow key={nome}>
                  <TableCell className="font-medium text-foreground">{nome}</TableCell>
                  <TableCell>{v.programados}</TableCell>
                  <TableCell>{v.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-mono text-[11px] font-bold tracking-[.06em] text-text-2 uppercase">
              Por Mês e Quinzena
            </h3>
            <div className="flex gap-2">
              <Button size="xs" variant="secondary" onClick={exportarResumoCsv}>
                <Download className="size-3" />
                CSV
              </Button>
              <a
                href={`/admin/ferias/resumo-pdf?${new URLSearchParams({
                  ...(filtroResumo.empresa && { empresa: filtroResumo.empresa }),
                  ...(filtroResumo.area && { area: filtroResumo.area }),
                  ...(filtroResumo.mes && { mes: String(filtroResumo.mes) }),
                  ...(filtroResumo.ano && { ano: String(filtroResumo.ano) }),
                }).toString()}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="xs" variant="secondary">
                  <FileDown className="size-3" />
                  PDF
                </Button>
              </a>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Quinzena</TableHead>
                <TableHead>Qtde.</TableHead>
                <TableHead>Valor aproximado</TableHead>
                <TableHead>Início do gozo</TableHead>
                <TableHead>Data de pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porMesQuinzena.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-text-3">
                    Nenhum período programado no filtro atual.
                  </TableCell>
                </TableRow>
              ) : (
                porMesQuinzena.map((v) => (
                  <TableRow key={`${v.ano}-${v.mes}-${v.quinzena}`}>
                    <TableCell className="font-medium text-foreground">
                      {MESES[v.mes - 1]}/{v.ano}
                    </TableCell>
                    <TableCell>{v.quinzena}ª quinzena</TableCell>
                    <TableCell>{v.qtd}</TableCell>
                    <TableCell>{formatarMoeda(v.valor)}</TableCell>
                    <TableCell>{v.gozoInicio.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</TableCell>
                    <TableCell className="font-bold text-primary">
                      {v.dataPagamento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsPanel>

      <TabsPanel value="mural" className="flex flex-col gap-3">
        <div className="flex items-center justify-between print:hidden">
          <FiltroBar empresas={empresas} areas={areas} filtro={filtroMural} />
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Imprimir
          </Button>
        </div>
        <p className="font-mono text-[11px] text-text-3 print:hidden">
          lista para impressão — apenas colaboradores já programados. Filtre por mês pra imprimir o mural de um
          período específico.
        </p>
        <div className="flex flex-col items-center gap-0.5">
          <h2 className="text-center font-mono text-base font-bold tracking-[.08em] uppercase">
            Programação de Férias — {empresaMural}
          </h2>
          <p className="text-center font-mono text-[11px] tracking-[.06em] text-text-2 uppercase">
            Mês de referência: {filtroMural.mes ? MESES[filtroMural.mes - 1] : "todos os períodos programados"}
            {filtroMural.area && ` · ${filtroMural.area}`}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Matrícula</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Mês</TableHead>
              <TableHead>Gozo Inicial</TableHead>
              <TableHead>Gozo Final</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtroMural.filtrados.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.matricula}</TableCell>
                <TableCell className="font-medium text-foreground">{p.nome}</TableCell>
                <TableCell>{p.departamento ?? "—"}</TableCell>
                <TableCell>{p.mes ? `${MESES[p.mes - 1]}/${p.ano}` : "—"}</TableCell>
                <TableCell>{formatarData(p.gozoInicio)}</TableCell>
                <TableCell>{formatarData(p.gozoFim)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TabsPanel>
    </Tabs>
  );
}
