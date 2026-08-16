"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, ChevronDown, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { lerArquivoTexto } from "../importar/ler-arquivo";
import {
  previewExtratoBancoHoras,
  confirmarExtratoBancoHoras,
  type PreviewBancoHorasResult,
} from "./importar-actions";

export function Importador({ onImportado }: { onImportado?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewBancoHorasResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);

    const texto = await lerArquivoTexto(f);
    setConteudo(texto);
    startTransition(async () => {
      const result = await previewExtratoBancoHoras(texto);
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
      const result = await confirmarExtratoBancoHoras(conteudo, file.name);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Banco de horas atualizado: ${result.resumo?.funcionarios} funcionário(s), ${result.resumo?.competenciasRecalculadas} competência(s) recalculada(s).`
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

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[12px] font-bold tracking-[.04em] text-foreground">
            Importar extrato do banco de horas
          </span>
          <span className="font-mono text-[10px] text-text-3">
            um ou mais meses de uma vez — reimportar um mês já existente recalcula o histórico a partir dele
          </span>
        </div>
        <ChevronDown className={`size-4 shrink-0 text-text-3 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="flex flex-col gap-6 border-t border-border px-4 py-5">
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
              {file ? "Arquivo carregado" : "Clique para selecionar o extrato do banco de horas (.TXT)"}
            </strong>
            {file && <span className="font-mono text-[10px] text-success">{file.name}</span>}
          </label>

          {isPending && !preview && <p className="font-mono text-[11px] text-text-3">processando arquivo...</p>}

          {preview && (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="font-mono text-[11px] font-medium tracking-[.06em] text-text-2 uppercase">
                  {preview.empresa.nome} · período {preview.periodoInicio} a {preview.periodoFim}
                </p>
                <p className="font-mono text-[10px] text-text-3">
                  {preview.encontrados.length} funcionário(s) encontrado(s) · {preview.naoEncontrados.length} não
                  encontrado(s)
                </p>
                {preview.competenciasJaImportadas.length > 0 && (
                  <p className="font-mono text-[10px] text-warning">
                    Já existem dados para {preview.competenciasJaImportadas.join(", ")} — serão sobrescritos e o
                    histórico recalculado a partir deles.
                  </p>
                )}
              </div>

              {preview.alertasCredito.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning-dim px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="size-4 text-warning" />
                    <span className="font-mono text-[11px] font-bold tracking-[.04em] text-warning">
                      {preview.alertasCredito.length} funcionário(s) com crédito no arquivo apesar da função não fazer
                      hora extra
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-text-3">
                    Agente de portaria A, aprendiz, aux. de borracharia, aux. elétrica, ou quem recebe gratificação.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.alertasCredito.map((a) => (
                      <span
                        key={a.matricula}
                        className="rounded-[3px] border border-warning/30 bg-card px-2 py-0.5 font-mono text-[10px] text-warning"
                        title={a.cargo}
                      >
                        {a.matricula} · {a.nome} · {a.competencias.join(", ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Table containerClassName="max-h-[50vh] overflow-y-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Competências no arquivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.encontrados.map((l) => (
                    <TableRow key={l.matricula}>
                      <TableCell>{l.matricula}</TableCell>
                      <TableCell className="font-medium text-foreground">{l.nome}</TableCell>
                      <TableCell>{l.competencias.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {preview.naoEncontrados.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                    Matrículas do arquivo não encontradas nesta empresa
                  </p>
                  <Table containerClassName="max-h-[30vh] overflow-y-auto">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Competências</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.naoEncontrados.map((l) => (
                        <TableRow key={l.matricula}>
                          <TableCell>{l.matricula}</TableCell>
                          <TableCell>{l.competencias.join(", ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex gap-2.5">
                <Button onClick={handleConfirmar} disabled={isPending}>
                  <FileText />
                  {isPending ? "Aplicando..." : "Confirmar importação"}
                </Button>
                <Button variant="secondary" onClick={handleCancelar} disabled={isPending}>
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
