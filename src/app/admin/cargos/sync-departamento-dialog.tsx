"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, Upload, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatCard } from "../importar/stat-card";
import { lerArquivoTexto } from "../importar/ler-arquivo";
import {
  previewSyncDepartamento,
  confirmarSyncDepartamento,
  type PreviewSyncDepartamentoResult,
} from "./sync-actions";

export function SyncDepartamentoDialog() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewSyncDepartamentoResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setConteudo(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);

    const texto = await lerArquivoTexto(f);
    setConteudo(texto);
    startTransition(async () => {
      const result = await previewSyncDepartamento(texto);
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
    if (!conteudo) return;
    startTransition(async () => {
      const result = await confirmarSyncDepartamento(conteudo);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Sincronizado: ${result.resumo?.atualizados} cargo(s) atualizado(s), ${result.resumo?.criados} novo(s).`
      );
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="secondary">
            <RefreshCw />
            Sincronizar departamento/setor
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sincronizar departamento/setor dos cargos</DialogTitle>
          <DialogDescription>
            <span className="font-bold text-primary">Folha &gt; Relatório &gt; Listagem Genérica &gt; Cod 41</span> ·
            atualiza departamento e setor dos cargos existentes, cadastra os que faltarem — nunca sobrescreve
            cesta básica/vale-refeição.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
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
              {file ? "Arquivo carregado" : "Clique para selecionar a Relação Funcionários (.TXT)"}
            </strong>
            {file && <span className="font-mono text-[10px] text-success">{file.name}</span>}
          </label>

          {isPending && !preview && <p className="font-mono text-[11px] text-text-3">processando arquivo...</p>}

          {preview && (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="Atualizados" value={preview.atualizados.length} cor="green" />
                <StatCard label="Sem mudança" value={preview.semMudanca} cor="neutral" />
                <StatCard label="Cargos novos" value={preview.novos.length} cor="blue" />
              </div>

              {preview.novos.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[10px] tracking-[.06em] text-primary uppercase">
                    Cargos que serão criados
                  </p>
                  <Table containerClassName="max-h-[30vh] overflow-y-auto">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cargo</TableHead>
                        <TableHead>Departamento</TableHead>
                        <TableHead>Setor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.novos.map((n) => (
                        <TableRow key={n.nome}>
                          <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
                          <TableCell>{n.departamento}</TableCell>
                          <TableCell>{n.setor}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {preview.atualizados.length > 0 && (
                <Table containerClassName="max-h-[40vh] overflow-y-auto">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Setor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.atualizados.map((a) => (
                      <TableRow key={a.cargoId}>
                        <TableCell className="font-medium text-foreground">{a.nome}</TableCell>
                        <TableCell>
                          {a.departamentoAtual ?? "—"} → {a.departamentoNovo}
                        </TableCell>
                        <TableCell>
                          {a.setorAtual ?? "—"} → {a.setorNovo}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={isPending || !preview || (preview.atualizados.length === 0 && preview.novos.length === 0)}
          >
            {isPending ? "Aplicando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
