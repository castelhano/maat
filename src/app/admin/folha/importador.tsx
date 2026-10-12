"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lerArquivoTexto } from "@/app/admin/importar/ler-arquivo";
import { parseFolhaPagamento, type FolhaPagamentoParseResult } from "@/lib/parsers/folha-pagamento";
import { confirmarFolha, previewFolha, type PreviewFolha } from "./actions";
import { StatCard } from "./stat-card";

export function ImportadorFolha({ onImportado }: { onImportado: (empresaId: string, competencia: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dados, setDados] = useState<FolhaPagamentoParseResult | null>(null);
  const [preview, setPreview] = useState<PreviewFolha | null>(null);
  const [isPending, startTransition] = useTransition();

  function limpar() {
    setFile(null);
    setDados(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);
    let parsed: FolhaPagamentoParseResult;
    try {
      parsed = parseFolhaPagamento(await lerArquivoTexto(f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ler o arquivo.");
      limpar();
      return;
    }
    setDados(parsed);
    startTransition(async () => {
      const result = await previewFolha(parsed);
      if (result.error) {
        toast.error(result.error);
        limpar();
        return;
      }
      setPreview(result.data);
    });
  }

  function handleConfirmar() {
    if (!dados || !file) return;
    startTransition(async () => {
      const result = await confirmarFolha(dados, file.name);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Folha ${dados.competencia} importada: ${dados.funcionarios.length} funcionário(s).`);
      limpar();
      onImportado(result.empresaId!, result.competencia!);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
          IMPORTAR
        </span>
        <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">
          Folha de pagamento do ERP (FLP - Folha de Pagamento, .TXT)
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${
          file ? "border-success bg-success-dim" : "border-border-hi bg-white/[.04] hover:border-primary hover:bg-accent-glow"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.TXT"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? <CheckCircle2 className="size-[22px] text-success" /> : <Upload className="size-[22px] text-text-3" />}
        <strong className="text-xs font-medium text-foreground">
          {file ? "Arquivo carregado" : "Clique para selecionar o arquivo da folha (.TXT)"}
        </strong>
        {file && <span className="font-mono text-[10px] text-success">{file.name}</span>}
      </label>

      {isPending && !preview && <p className="font-mono text-[11px] text-text-3">conferindo a folha...</p>}

      {preview && (
        <>
          <p className="font-mono text-[11px] text-text-2">
            {preview.empresa.nome} · competência <span className="text-foreground">{preview.competencia}</span> ·{" "}
            {preview.funcionarios} funcionário(s)
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard label="Com erro" value={preview.resumo.erro} cor="red" />
            <StatCard label="Com alerta" value={preview.resumo.alerta} cor="yellow" />
            <StatCard label="Pendentes" value={preview.resumo.pendente} cor="blue" />
            <StatCard label="Tudo certo" value={preview.resumo.ok} cor="green" />
          </div>
          {!preview.bancoHorasImportado && (
            <p className="font-mono text-[11px] text-warning">
              Banco de horas de {preview.competencia} ainda não importado — a hora extra 50% será conferida com ele assim que for importado.
            </p>
          )}
          {preview.jaImportada && (
            <p className="font-mono text-[11px] text-warning">
              A folha de {preview.competencia} já foi importada — confirmar vai substituí-la por este arquivo.
            </p>
          )}
          <div className="flex gap-2.5">
            <Button onClick={handleConfirmar} disabled={isPending}>
              {isPending ? "Gravando..." : "Confirmar importação"}
            </Button>
            <Button variant="secondary" onClick={limpar} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
