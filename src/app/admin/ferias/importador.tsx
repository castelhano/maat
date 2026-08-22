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
import { confirmarImportacaoFerias, previewImportacaoFerias, type PreviewResult } from "./actions";

function StatCard({
  label,
  value,
  cor,
}: {
  label: string;
  value: number;
  cor: "blue" | "green" | "yellow" | "red" | "neutral";
}) {
  const corBarra = {
    blue: "before:bg-primary",
    green: "before:bg-success",
    yellow: "before:bg-warning",
    red: "before:bg-danger",
    neutral: "before:bg-text-3",
  }[cor];

  return (
    <div
      className={`relative overflow-hidden rounded-sm border border-border bg-secondary px-4 py-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-sm ${corBarra}`}
    >
      <div className="mb-1.5 font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">{label}</div>
      <div className="font-mono text-[22px] leading-none font-bold text-foreground">{value}</div>
    </div>
  );
}

export function Importador({ onImportado }: { onImportado?: () => void } = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);

    const buffer = await f.arrayBuffer();
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      texto = new TextDecoder("windows-1252").decode(buffer);
    }

    setConteudo(texto);
    startTransition(async () => {
      const result = await previewImportacaoFerias(texto);
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
    startTransition(async () => {
      const result = await confirmarImportacaoFerias(conteudo, file.name);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Importação aplicada: ${result.resumo?.criados} criado(s), ${result.resumo?.atualizados} atualizado(s).`
      );
      setFile(null);
      setConteudo(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      onImportado?.();
    });
  }

  function handleCancelar() {
    setFile(null);
    setConteudo(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

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
          {file ? (
            <CheckCircle2 className="size-[22px] text-success" />
          ) : (
            <Upload className="size-[22px] text-text-3" />
          )}
          <strong className="text-xs font-medium text-foreground">
            {file ? "Arquivo carregado" : "Clique para selecionar a listagem de programação de férias (.TXT)"}
          </strong>
          {file && <span className="font-mono text-[10px] text-success">{file.name}</span>}
        </label>
      </div>

      {isPending && !preview && (
        <p className="font-mono text-[11px] text-text-3">processando arquivo...</p>
      )}

      {preview && (
        <>
          <div>
            <div className="mb-3.5 flex items-center gap-2.5">
              <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
                ETAPA 02
              </span>
              <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">
                Conferência — {preview.empresa.nome}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatCard label="Novos" value={preview.novos.length} cor="blue" />
              <StatCard label="Atualizados" value={preview.atualizados.length} cor="green" />
              <StatCard label="Sem mudança" value={preview.semMudanca} cor="neutral" />
              <StatCard label="Não encontrados" value={preview.naoEncontrados.length} cor="yellow" />
            </div>
          </div>

          {!preview.empresa.existente && (
            <p className="font-mono text-[11px] text-danger">
              Empresa {preview.empresa.nome} (código {preview.empresa.codigo}) ainda não está
              cadastrada — importe a folha de salários dela antes.
            </p>
          )}

          {preview.novos.length > 0 && (
            <Table containerClassName="max-h-[50vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Faltas</TableHead>
                  <TableHead>Dias de direito</TableHead>
                  <TableHead>Limite</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.novos.map((n) => (
                  <TableRow key={n.matricula}>
                    <TableCell>{n.matricula}</TableCell>
                    <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
                    <TableCell>{n.faltas}</TableCell>
                    <TableCell>{n.diasDireito}</TableCell>
                    <TableCell>{new Date(n.limite).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.naoEncontrados.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                Matrículas do arquivo que não têm cadastro de funcionário (importe a folha de
                salários primeiro)
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
                  {preview.naoEncontrados.map((n) => (
                    <TableRow key={n.matricula}>
                      <TableCell>{n.matricula}</TableCell>
                      <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
                      <TableCell>{n.funcao}</TableCell>
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
              <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">
                Aplicar
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex gap-2.5">
              <Button onClick={handleConfirmar} disabled={isPending || !preview.empresa.existente}>
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
