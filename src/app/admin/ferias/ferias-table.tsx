"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Printer, CalendarPlus } from "lucide-react";
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
  const pagamentoPreview = gozoInicioPreview
    ? new Date(gozoInicioPreview.getTime() - 2 * 86_400_000)
    : null;

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
    <div className="flex items-center gap-1.5">
      <input type="date" className={inputCls} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
      <span className="text-text-3">a</span>
      <input type="date" className={inputCls} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
      <Button size="xs" variant="secondary" onClick={salvar} disabled={isPending}>
        {isPending ? "..." : "Salvar"}
      </Button>
      {!custom && <span className="font-mono text-[9px] text-text-3">(padrão)</span>}
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
  const naoProgramados = periodos.filter((p) => !p.gozoInicio);

  const porArea = useMemo(() => {
    const mapa = new Map<string, { programados: number; total: number }>();
    for (const p of periodos) {
      const chave = p.setor ?? "Não classificado";
      const atual = mapa.get(chave) ?? { programados: 0, total: 0 };
      atual.total++;
      if (p.gozoInicio) atual.programados++;
      mapa.set(chave, atual);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [periodos]);

  const porDepartamento = useMemo(() => {
    const mapa = new Map<string, { programados: number; total: number }>();
    for (const p of periodos) {
      const chave = p.departamento ?? "Não classificado";
      const atual = mapa.get(chave) ?? { programados: 0, total: 0 };
      atual.total++;
      if (p.gozoInicio) atual.programados++;
      mapa.set(chave, atual);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [periodos]);

  const porMes = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of periodos) {
      if (!p.mes) continue;
      const chave = `${MESES[p.mes - 1]}/${p.ano}`;
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    return [...mapa.entries()];
  }, [periodos]);

  function exportarEnvioGestores() {
    baixarCsv(
      "envio_gestores_ferias.csv",
      ["Matrícula", "Nome", "Departamento", "Limite", "Mês", "1ª Quinz.", "2ª Quinz.", "Gozo Inicial", "Gozo Final"],
      programados.map((p) => [
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

  return (
    <Tabs defaultValue="programacao" className="flex flex-col gap-4">
      <TabsList>
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
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] text-text-3">
                {periodos.length} período(s) · {programados.length} programado(s) · {naoProgramados.length} pendente(s)
                — clique em <span className="font-bold text-primary">Programar</span> na linha do colaborador
              </p>
              <Button size="sm" variant="secondary" onClick={exportarEnvioGestores}>
                <Download className="size-3.5" />
                Exportar CSV p/ gestores
              </Button>
            </div>
            <Table containerClassName="max-h-[70vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Depto</TableHead>
                  <TableHead>Faltas</TableHead>
                  <TableHead>Dias</TableHead>
                  <TableHead>Limite</TableHead>
                  <TableHead>Mês programado</TableHead>
                  <TableHead>Gozo Ini.</TableHead>
                  <TableHead>Gozo Fim</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.matricula}</TableCell>
                    <TableCell className="font-medium text-foreground whitespace-nowrap">{p.nome}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.departamento ?? "—"}</TableCell>
                    <TableCell className="text-center">{p.faltas}</TableCell>
                    <TableCell className="text-center font-medium text-foreground">{p.diasDireito}</TableCell>
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
          <h3 className="mb-2 font-mono text-[11px] font-bold tracking-[.06em] text-text-2 uppercase">Por Departamento</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Departamento</TableHead>
                <TableHead>Programados</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porDepartamento.map(([nome, v]) => (
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
          <h3 className="mb-2 font-mono text-[11px] font-bold tracking-[.06em] text-text-2 uppercase">Por Mês</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Qtde.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porMes.map(([nome, qtd]) => (
                <TableRow key={nome}>
                  <TableCell className="font-medium text-foreground">{nome}</TableCell>
                  <TableCell>{qtd}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsPanel>

      <TabsPanel value="mural" className="flex flex-col gap-3">
        <div className="flex items-center justify-between print:hidden">
          <p className="font-mono text-[11px] text-text-3">
            lista para impressão — apenas colaboradores já programados
          </p>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Imprimir
          </Button>
        </div>
        <h2 className="text-center font-mono text-base font-bold tracking-[.08em] uppercase">
          Programação de Férias
        </h2>
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
            {programados.map((p) => (
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
