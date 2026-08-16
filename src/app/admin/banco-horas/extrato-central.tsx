"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CompetenciaSelect } from "@/components/competencia-select";
import { competenciaPadrao } from "@/lib/competencia";
import { paraCsv, baixarCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import {
  listarFuncionariosComBancoHoras,
  buscarExtratoColaborador,
  type FuncionarioOpcao,
  type ExtratoResult,
} from "./actions";
import { Importador } from "./importador";

function fmtHoras(decimal: number): string {
  const neg = decimal < 0;
  const abs = Math.abs(decimal);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${neg ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

function nomeCompetencia(competencia: string): string {
  const [mes, ano] = competencia.split("/");
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

export function ExtratoCentral() {
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpcao[]>([]);
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<FuncionarioOpcao | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaFoco, setBuscaFoco] = useState(false);

  const padrao = competenciaPadrao();
  const [mesInicio, setMesInicio] = useState("01");
  const [anoInicio, setAnoInicio] = useState(padrao.ano);
  const [mesFim, setMesFim] = useState(padrao.mes);
  const [anoFim, setAnoFim] = useState(padrao.ano);

  const [resultado, setResultado] = useState<ExtratoResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, startCarregando] = useTransition();

  useEffect(() => {
    listarFuncionariosComBancoHoras().then(setFuncionarios);
  }, []);

  function handleImportado() {
    listarFuncionariosComBancoHoras().then(setFuncionarios);
    if (funcionarioSelecionado) {
      carregar(funcionarioSelecionado.id, `${mesInicio}/${anoInicio}`, `${mesFim}/${anoFim}`);
    }
  }

  const opcoesFiltradas = useMemo(() => {
    if (!busca.trim()) return funcionarios.slice(0, 8);
    const termo = busca.trim().toLowerCase();
    return funcionarios
      .filter((f) => f.nome.toLowerCase().includes(termo) || f.matricula.includes(termo))
      .slice(0, 8);
  }, [busca, funcionarios]);

  function carregar(funcionarioId: string, inicio: string, fim: string) {
    startCarregando(async () => {
      const result = await buscarExtratoColaborador(funcionarioId, inicio, fim);
      setResultado(result.data);
      setErro(result.error);
    });
  }

  function handleSelecionar(f: FuncionarioOpcao) {
    setFuncionarioSelecionado(f);
    setBusca("");
    setBuscaFoco(false);
    carregar(f.id, `${mesInicio}/${anoInicio}`, `${mesFim}/${anoFim}`);
  }

  function handleTrocarFuncionario() {
    setFuncionarioSelecionado(null);
    setResultado(null);
    setErro(null);
  }

  function handlePeriodoChange(campo: "mesInicio" | "anoInicio" | "mesFim" | "anoFim", valor: string) {
    const novo = {
      mesInicio: campo === "mesInicio" ? valor : mesInicio,
      anoInicio: campo === "anoInicio" ? valor : anoInicio,
      mesFim: campo === "mesFim" ? valor : mesFim,
      anoFim: campo === "anoFim" ? valor : anoFim,
    };
    if (campo === "mesInicio") setMesInicio(valor);
    if (campo === "anoInicio") setAnoInicio(valor);
    if (campo === "mesFim") setMesFim(valor);
    if (campo === "anoFim") setAnoFim(valor);

    if (funcionarioSelecionado) {
      carregar(funcionarioSelecionado.id, `${novo.mesInicio}/${novo.anoInicio}`, `${novo.mesFim}/${novo.anoFim}`);
    }
  }

  function handleExportarCsv() {
    if (!resultado) return;
    const headers = ["Competência", "Saldo Anterior", "Crédito", "Débito", "A Pagar", "Saldo Atual"];
    const linhas = resultado.linhas.map((l) => [
      l.competencia,
      fmtHoras(l.saldoAnterior),
      fmtHoras(l.creditoBruto),
      fmtHoras(l.debitoBruto),
      fmtHoras(l.aPagar),
      fmtHoras(l.saldoAtual),
    ]);
    baixarCsv(
      `extrato-banco-horas-${resultado.funcionario.matricula}`,
      paraCsv(headers, linhas)
    );
  }

  function handleEmitirPdf() {
    if (!funcionarioSelecionado) return;
    const params = new URLSearchParams({
      funcionarioId: funcionarioSelecionado.id,
      inicio: `${mesInicio}/${anoInicio}`,
      fim: `${mesFim}/${anoFim}`,
    });
    window.open(`/admin/banco-horas/extrato-pdf?${params.toString()}`, "_blank");
  }

  return (
    <div className="flex flex-col gap-6">
      <Importador onImportado={handleImportado} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-[280px] flex-col gap-2">
          <Label>Funcionário</Label>
          {funcionarioSelecionado ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary px-3 py-2">
              <span className="font-mono text-[12px]">
                <span className="text-text-3">{funcionarioSelecionado.matricula}</span>{" "}
                <span className="font-medium text-foreground">{funcionarioSelecionado.nome}</span>
              </span>
              <button
                type="button"
                onClick={handleTrocarFuncionario}
                className="text-text-3 hover:text-foreground"
                aria-label="Trocar funcionário"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onFocus={() => setBuscaFoco(true)}
                onBlur={() => setTimeout(() => setBuscaFoco(false), 150)}
                placeholder="Buscar por nome ou matrícula..."
                className="pl-9"
              />
              {buscaFoco && opcoesFiltradas.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
                  {opcoesFiltradas.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onMouseDown={() => handleSelecionar(f)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[12px] hover:bg-secondary"
                    >
                      <span className="text-text-3">{f.matricula}</span>
                      <span className="text-foreground">{f.nome}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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

        {resultado && (
          <div className="mb-[1px] flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportarCsv}>
              <Download />
              Exportar CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={handleEmitirPdf}>
              <FileText />
              Emitir PDF
            </Button>
          </div>
        )}
      </div>

      {!funcionarioSelecionado && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
          <p className="font-mono text-[12px] text-text-2">Busque um funcionário pra ver o extrato.</p>
        </div>
      )}

      {funcionarioSelecionado && carregando && (
        <p className="font-mono text-[11px] text-text-3">carregando...</p>
      )}

      {funcionarioSelecionado && !carregando && erro && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
          <p className="font-mono text-[12px] text-text-2">{erro}</p>
        </div>
      )}

      {funcionarioSelecionado && !carregando && resultado && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[14px] font-bold tracking-[.04em] text-foreground">
              {resultado.funcionario.matricula} — {resultado.funcionario.nome}
            </span>
            <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">
              extrato do banco de horas
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Saldo Anterior</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
                <TableHead className="text-right">Débito</TableHead>
                <TableHead className="text-right">A Pagar</TableHead>
                <TableHead className="text-right">Saldo Atual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.linhas.map((l) => (
                <TableRow key={l.competencia}>
                  <TableCell className="font-medium text-foreground">{nomeCompetencia(l.competencia)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtHoras(l.saldoAnterior)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtHoras(l.creditoBruto)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtHoras(l.debitoBruto)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtHoras(l.aPagar)}</TableCell>
                  <TableCell
                    className={`text-right font-mono font-bold ${
                      l.saldoAtual < 0 ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {fmtHoras(l.saldoAtual)}
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
