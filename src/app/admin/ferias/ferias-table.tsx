"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { salvarProgramacao } from "./actions";
import { Importador } from "./importador";

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

function statusBadge(status: FeriasLinha["status"]) {
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

function LinhaEditavel({ periodo, onSaved }: { periodo: FeriasLinha; onSaved: (p: FeriasLinha) => void }) {
  const [mes, setMes] = useState(periodo.mes ?? 0);
  const [ano, setAno] = useState(periodo.ano ?? new Date(periodo.dataLimite).getUTCFullYear());
  const [quinzena, setQuinzena] = useState(periodo.quinzena ?? 0);
  const [diasAbono, setDiasAbono] = useState(periodo.diasAbono);
  const [abonoTipo, setAbonoTipo] = useState<"inicio" | "final" | "">(periodo.abonoTipo ?? "");
  const [isPending, startTransition] = useTransition();

  const diasGozo = periodo.diasDireito - diasAbono;
  const gozoInicioPreview = useMemo(() => {
    if (!mes || !ano || !quinzena) return null;
    const dia = quinzena === 2 ? 16 : 1;
    let d = new Date(Date.UTC(ano, mes - 1, dia));
    if (abonoTipo === "inicio" && diasAbono > 0) d = new Date(d.getTime() + diasAbono * 86_400_000);
    return d;
  }, [mes, ano, quinzena, abonoTipo, diasAbono]);
  const gozoFimPreview = gozoInicioPreview
    ? new Date(gozoInicioPreview.getTime() + (diasGozo - 1) * 86_400_000)
    : null;

  function salvar() {
    startTransition(async () => {
      const result = await salvarProgramacao({
        feriasId: periodo.id,
        mes: mes || null,
        ano: mes ? ano : null,
        quinzena: quinzena || null,
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
        mes: mes || null,
        ano: mes ? ano : null,
        quinzena: quinzena || null,
        diasAbono,
        abonoTipo: diasAbono > 0 ? (abonoTipo || null) : null,
        gozoInicio: gozoInicioPreview?.toISOString() ?? null,
        gozoFim: gozoFimPreview?.toISOString() ?? null,
        status: gozoInicioPreview ? "programado" : "pendente",
      });
    });
  }

  const selectCls =
    "h-7 rounded-sm border border-border-hi bg-secondary px-1.5 font-mono text-[10px] text-foreground outline-none focus-visible:border-primary";

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{periodo.matricula}</TableCell>
      <TableCell className="font-medium text-foreground whitespace-nowrap">{periodo.nome}</TableCell>
      <TableCell className="whitespace-nowrap">{periodo.departamento ?? "—"}</TableCell>
      <TableCell className="text-center">{periodo.faltas}</TableCell>
      <TableCell className="text-center font-medium text-foreground">{periodo.diasDireito}</TableCell>
      <TableCell className="whitespace-nowrap">{formatarData(periodo.dataLimite)}</TableCell>
      <TableCell>
        <select className={selectCls} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
          <option value={0}>—</option>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <select className={selectCls} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
          {[2026, 2027, 2028, 2029].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <select className={selectCls} value={quinzena} onChange={(e) => setQuinzena(Number(e.target.value))}>
          <option value={0}>—</option>
          <option value={1}>1ª</option>
          <option value={2}>2ª</option>
        </select>
      </TableCell>
      <TableCell>
        <select
          className={selectCls}
          value={diasAbono}
          onChange={(e) => setDiasAbono(Number(e.target.value))}
        >
          <option value={0}>0</option>
          <option value={10}>10</option>
        </select>
      </TableCell>
      <TableCell>
        <select
          className={selectCls}
          value={abonoTipo}
          disabled={diasAbono === 0}
          onChange={(e) => setAbonoTipo(e.target.value as "inicio" | "final" | "")}
        >
          <option value="">—</option>
          <option value="inicio">Início</option>
          <option value="final">Final</option>
        </select>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {gozoInicioPreview ? gozoInicioPreview.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {gozoFimPreview ? gozoFimPreview.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatarMoeda(calcularValorAproximado(periodo.salario, diasGozo))}
      </TableCell>
      <TableCell>{statusBadge(gozoInicioPreview ? "programado" : "pendente")}</TableCell>
      <TableCell>
        <Button size="sm" variant="secondary" onClick={salvar} disabled={isPending}>
          {isPending ? "..." : "Salvar"}
        </Button>
      </TableCell>
    </TableRow>
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

export function FeriasTable({ periodos: periodosIniciais }: { periodos: FeriasLinha[] }) {
  const [periodos, setPeriodos] = useState(periodosIniciais);

  function atualizarPeriodo(atualizado: FeriasLinha) {
    setPeriodos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)));
  }

  const programados = periodos.filter((p) => p.status === "programado" || p.gozoInicio);
  const naoProgramados = periodos.filter((p) => !(p.status === "programado" || p.gozoInicio));

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
        <TabsTab value="resumo">Resumo</TabsTab>
        <TabsTab value="mural">Painel / Mural</TabsTab>
        <TabsIndicator />
      </TabsList>

      <TabsPanel value="programacao" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] text-text-3">
            {periodos.length} período(s) · {programados.length} programado(s) · {naoProgramados.length} pendente(s)
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
              <TableHead>Mês</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead>Quinz.</TableHead>
              <TableHead>Abono</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Gozo Ini.</TableHead>
              <TableHead>Gozo Fim</TableHead>
              <TableHead>Valor aprox.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodos.map((p) => (
              <LinhaEditavel key={p.id} periodo={p} onSaved={atualizarPeriodo} />
            ))}
          </TableBody>
        </Table>
      </TabsPanel>

      <TabsPanel value="importar">
        <Importador />
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
