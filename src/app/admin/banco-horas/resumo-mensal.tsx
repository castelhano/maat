"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, Download, FileDown, FileText, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CompetenciaSelect } from "@/components/competencia-select";
import { competenciaPadrao } from "@/lib/competencia";
import { paraCsv, baixarCsv } from "@/lib/csv";
import {
  buscarResumoMensal,
  listarOpcoesFiltroResumoMensal,
  type ResumoMensalResult,
  type ResumoMensalOpcoesFiltro,
} from "./actions";

const TODOS = "__todos__";

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

// Horas decimais com vírgula, ex. "2,50" — mesma convenção do TXT pro ERP.
function fmtDecimalCsv(decimal: number): string {
  return decimal.toFixed(2).replace(".", ",");
}

function baixarArquivo(nomeArquivo: string, conteudo: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = nomeArquivo;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function ResumoMensal() {
  const padrao = competenciaPadrao();
  const [mes, setMes] = useState(padrao.mes);
  const [ano, setAno] = useState(padrao.ano);
  const [empresaId, setEmpresaId] = useState<string>(TODOS);
  const [departamento, setDepartamento] = useState<string>(TODOS);
  const [setor, setSetor] = useState<string>(TODOS);
  const [opcoes, setOpcoes] = useState<ResumoMensalOpcoesFiltro>({ empresas: [], departamentos: [], setores: [] });
  const [resultado, setResultado] = useState<ResumoMensalResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, startCarregando] = useTransition();

  const competencia = mes && ano ? `${mes}/${ano}` : "";

  useEffect(() => {
    listarOpcoesFiltroResumoMensal().then(setOpcoes);
    if (competencia) carregar(competencia, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function filtrosAtuais(overrides?: { empresaId?: string; departamento?: string; setor?: string }) {
    const e = overrides?.empresaId ?? empresaId;
    const d = overrides?.departamento ?? departamento;
    const s = overrides?.setor ?? setor;
    return {
      empresaId: e === TODOS ? undefined : e,
      departamento: d === TODOS ? undefined : d,
      setor: s === TODOS ? undefined : s,
    };
  }

  function carregar(comp: string, overrides: { empresaId?: string; departamento?: string; setor?: string }) {
    startCarregando(async () => {
      const result = await buscarResumoMensal(comp, filtrosAtuais(overrides));
      setResultado(result.data);
      setErro(result.error);
    });
  }

  function handleMesChange(valor: string) {
    setMes(valor);
    const comp = valor && ano ? `${valor}/${ano}` : "";
    if (comp) carregar(comp, {});
  }

  function handleAnoChange(valor: string) {
    setAno(valor);
    const comp = mes && valor ? `${mes}/${valor}` : "";
    if (comp) carregar(comp, {});
  }

  function handleEmpresaChange(valor: string) {
    setEmpresaId(valor);
    if (competencia) carregar(competencia, { empresaId: valor });
  }

  function handleDepartamentoChange(valor: string) {
    setDepartamento(valor);
    if (competencia) carregar(competencia, { departamento: valor });
  }

  function handleSetorChange(valor: string) {
    setSetor(valor);
    if (competencia) carregar(competencia, { setor: valor });
  }

  const alertas = useMemo(() => resultado?.linhas.filter((l) => l.alertaCredito) ?? [], [resultado]);

  function handleExportarCsv(formato: "horas" | "decimal") {
    if (!resultado) return;
    const fmt = formato === "decimal" ? fmtDecimalCsv : fmtHorasCsv;
    const headers = ["Matrícula", "Nome", "Empresa", "Crédito", "Débito", "A Pagar", "Saldo Final", "Alerta"];
    const linhas = resultado.linhas.map((l) => [
      l.matricula,
      l.nome,
      l.empresa,
      fmt(l.creditoBruto),
      fmt(l.debitoBruto),
      fmt(l.pagoNoMes),
      fmt(l.saldoFinal),
      l.alertaCredito ? "crédito indevido" : "",
    ]);
    const sufixo = formato === "decimal" ? "-decimal" : "";
    baixarCsv(`banco-horas-resumo-${resultado.competencia.replace("/", "-")}${sufixo}`, paraCsv(headers, linhas));
  }

  function handleExportarTxtErp() {
    if (!resultado) return;
    // Layout fixo pro ERP: matrícula com 6 dígitos + 3 espaços + valor "A Pagar" em horas
    // decimais (vírgula), ex. "001461   2,50".
    const linhas = resultado.linhas
      .filter((l) => l.pagoNoMes > 0.001)
      .map((l) => `${l.matricula.padStart(6, "0")}   ${l.pagoNoMes.toFixed(2).replace(".", ",")}`);
    baixarArquivo(
      `banco-horas-a-pagar-${resultado.competencia.replace("/", "-")}.txt`,
      linhas.join("\r\n") + "\r\n",
      "text/plain;charset=windows-1252;"
    );
  }

  function handleExportarPdf() {
    if (!resultado) return;
    const params = new URLSearchParams({ competencia: resultado.competencia });
    const f = filtrosAtuais();
    if (f.empresaId) params.set("empresaId", f.empresaId);
    if (f.departamento) params.set("departamento", f.departamento);
    if (f.setor) params.set("setor", f.setor);
    window.open(`/admin/banco-horas/resumo-pdf?${params.toString()}`, "_blank");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <CompetenciaSelect mes={mes} ano={ano} onMesChange={handleMesChange} onAnoChange={handleAnoChange} />

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

        {resultado && (
          <div className="mb-[1px] flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="secondary" size="sm">
                    <Download />
                    Exportar CSV
                    <ChevronDown />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExportarCsv("horas")}>Em horas (H:MM)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportarCsv("decimal")}>Em decimais (2,50)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" size="sm" onClick={handleExportarPdf}>
              <FileText />
              Exportar PDF
            </Button>
            <Button size="sm" onClick={handleExportarTxtErp}>
              <FileDown />
              Gerar TXT pro ERP
            </Button>
          </div>
        )}
      </div>

      {carregando && <p className="font-mono text-[11px] text-text-3">carregando...</p>}

      {!carregando && erro && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
          <p className="font-mono text-[12px] text-text-2">{erro}</p>
        </div>
      )}

      {!carregando && resultado && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <div className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
              <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">Funcionários</span>
              <span className="font-mono text-[20px] leading-none font-bold">{resultado.linhas.length}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
              <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">Crédito total</span>
              <span className="font-mono text-[20px] leading-none font-bold">{fmtHoras(resultado.totais.creditoBruto)}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
              <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">Débito total</span>
              <span className="font-mono text-[20px] leading-none font-bold">{fmtHoras(resultado.totais.debitoBruto)}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
              <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">A pagar total</span>
              <span className="font-mono text-[20px] leading-none font-bold">{fmtHoras(resultado.totais.pagoNoMes)}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
              <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">Saldo (pos / neg)</span>
              <span className="font-mono text-[16px] leading-tight font-bold">
                <span className="text-success">{fmtHoras(resultado.totais.saldoPositivo)}</span>
                {" / "}
                <span className="text-destructive">{fmtHoras(resultado.totais.saldoNegativo)}</span>
              </span>
            </div>
          </div>

          {alertas.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning-dim px-4 py-3.5">
              <div className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-warning" />
                <span className="font-mono text-[11px] font-bold tracking-[.04em] text-warning">
                  {alertas.length} funcionário(s) com crédito lançado apesar da função não fazer hora extra
                </span>
              </div>
              <p className="font-mono text-[10px] text-text-3">
                Agente de portaria A, aprendiz, aux. de borracharia, aux. elétrica, ou quem recebe gratificação.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {alertas.map((a) => (
                  <span
                    key={a.matricula}
                    className="rounded-[3px] border border-warning/30 bg-card px-2 py-0.5 font-mono text-[10px] text-warning"
                    title={a.cargo}
                  >
                    {a.matricula} · {a.nome} · {fmtHoras(a.creditoBruto)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Table containerClassName="max-h-[65vh] overflow-y-auto">
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
                <TableHead className="text-right">Débito</TableHead>
                <TableHead className="text-right">A Pagar</TableHead>
                <TableHead className="text-right">Saldo Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.linhas.map((l) => (
                <TableRow key={l.matricula} className={l.alertaCredito ? "bg-warning-dim" : undefined}>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {l.alertaCredito && <TriangleAlert className="size-3.5 shrink-0 text-warning" />}
                      {l.matricula}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{l.nome}</TableCell>
                  <TableCell>{l.empresa}</TableCell>
                  <TableCell className={`text-right font-mono ${l.alertaCredito ? "font-bold text-warning" : ""}`}>
                    {fmtHoras(l.creditoBruto)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtHoras(l.debitoBruto)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtHoras(l.pagoNoMes)}</TableCell>
                  <TableCell
                    className={`text-right font-mono font-bold ${l.saldoFinal < 0 ? "text-destructive" : "text-foreground"}`}
                  >
                    {fmtHoras(l.saldoFinal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
