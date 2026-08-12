"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { previewFaltas, confirmarFaltas, type PreviewFaltasResult } from "./faltas-actions";
import { StatCard } from "./stat-card";
import { lerArquivoTexto } from "./ler-arquivo";

export function FaltasImportador({
  competencia,
  onImportado,
}: {
  competencia: string;
  onImportado?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewFaltasResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);

    const texto = await lerArquivoTexto(f);
    setConteudo(texto);
    startTransition(async () => {
      const result = await previewFaltas(texto);
      if (result.error) {
        toast.error(result.error);
        setFile(null);
        setConteudo(null);
        return;
      }
      setPreview(result.data);
    });
  }

  function handleConfirmar() {
    if (!conteudo || !file) return;
    if (!competencia) {
      toast.error("Selecione a competência no topo da página antes de confirmar.");
      return;
    }
    startTransition(async () => {
      const result = await confirmarFaltas(conteudo, file.name, competencia);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Faltas aplicadas: ${result.resumo?.faltasRegistradas} falta(s) em ${result.resumo?.funcionarios} funcionário(s).`
      );
      handleCancelar();
      onImportado?.();
    });
  }

  function handleCancelar() {
    setFile(null);
    setConteudo(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const competenciaDivergente = preview?.competenciaSugerida && preview.competenciaSugerida !== competencia;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3.5 flex items-center gap-2.5">
          <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
            ETAPA 01
          </span>
          <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">
            Selecionar arquivo
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
            file
              ? "border-success bg-success-dim"
              : "border-border-hi bg-white/[.04] hover:border-primary hover:bg-accent-glow"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {file ? <CheckCircle2 className="size-[22px] text-success" /> : <Upload className="size-[22px] text-text-3" />}
          <strong className="text-xs font-medium text-foreground">
            {file ? "Arquivo carregado" : "Clique para selecionar o relatório de faltas (.TXT)"}
          </strong>
          {file && <span className="font-mono text-[10px] text-success">{file.name}</span>}
        </label>
      </div>

      {isPending && !preview && <p className="font-mono text-[11px] text-text-3">processando arquivo...</p>}

      {preview && (
        <>
          <div>
            <div className="mb-3.5 flex items-center gap-2.5">
              <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
                ETAPA 02
              </span>
              <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">
                Conferência — {preview.empresa.nome}
                {preview.competenciaSugerida ? ` · período ${preview.competenciaSugerida}` : ""}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatCard label="Encontrados" value={preview.encontrados.length} cor="green" />
              <StatCard label="Não encontrados" value={preview.naoEncontrados.length} cor="red" />
              <StatCard label="Faltas no período (total)" value={preview.encontrados.reduce((acc, l) => acc + l.qtde, 0)} cor="blue" />
              <StatCard label="Já registradas antes" value={preview.totalFaltasNoPeriodoAtual} cor="yellow" />
            </div>
          </div>

          {competenciaDivergente && (
            <p className="font-mono text-[10px] text-warning">
              O período do arquivo sugere a competência {preview.competenciaSugerida}, diferente da selecionada no topo
              ({competencia || "nenhuma"}). Ajuste antes de confirmar — a importação vai travar se não bater.
            </p>
          )}

          {preview.totalFaltasNoPeriodoAtual > 0 && (
            <p className="font-mono text-[10px] text-text-3">
              Já existem {preview.totalFaltasNoPeriodoAtual} falta(s) registrada(s) nesse período para esta empresa —
              serão substituídas pelas deste arquivo (por funcionário, só dentro do período do arquivo).
            </p>
          )}

          <Table containerClassName="max-h-[60vh] overflow-y-auto">
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Faltas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.encontrados.map((l) => (
                <TableRow key={l.matricula}>
                  <TableCell>{l.matricula}</TableCell>
                  <TableCell className="font-medium text-foreground">{l.nome}</TableCell>
                  <TableCell>{l.funcao}</TableCell>
                  <TableCell>{l.qtde}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {preview.naoEncontrados.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                Matrículas do arquivo não encontradas nesta empresa
              </p>
              <Table containerClassName="max-h-[40vh] overflow-y-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Função</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.naoEncontrados.map((l) => (
                    <TableRow key={l.matricula}>
                      <TableCell>{l.matricula}</TableCell>
                      <TableCell className="font-medium text-foreground">{l.nome}</TableCell>
                      <TableCell>{l.funcao}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div>
            <div className="mb-3.5 flex items-center gap-2.5">
              <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
                ETAPA 03
              </span>
              <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">Aplicar</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex gap-2.5">
              <Button onClick={handleConfirmar} disabled={isPending || !competencia}>
                <FileText />
                {isPending ? "Aplicando..." : "Confirmar importação"}
              </Button>
              <Button variant="secondary" onClick={handleCancelar} disabled={isPending}>
                Cancelar
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
