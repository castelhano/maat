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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { previewAfastamentos, confirmarAfastamentos, type PreviewAfastamentosResult } from "./afastamentos-actions";
import { StatCard } from "./stat-card";
import { lerArquivoTexto } from "./ler-arquivo";

export function AfastamentosImportador({
  competencia,
  onImportado,
}: {
  competencia: string;
  onImportado?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewAfastamentosResult | null>(null);
  const [resolucoes, setResolucoes] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);
    setResolucoes({});

    const texto = await lerArquivoTexto(f);
    setConteudo(texto);
    startTransition(async () => {
      const result = await previewAfastamentos(texto);
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
      const result = await confirmarAfastamentos(conteudo, file.name, competencia, resolucoes);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Afastamentos aplicados: ${result.resumo?.atualizados} funcionário(s) atualizado(s).`);
      handleCancelar();
      onImportado?.();
    });
  }

  function handleCancelar() {
    setFile(null);
    setConteudo(null);
    setPreview(null);
    setResolucoes({});
    if (inputRef.current) inputRef.current.value = "";
  }

  const ambiguosPendentes = preview?.ambiguos.filter((a) => !resolucoes[a.matricula]).length ?? 0;

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
            accept=".txt,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {file ? <CheckCircle2 className="size-[22px] text-success" /> : <Upload className="size-[22px] text-text-3" />}
          <strong className="text-xs font-medium text-foreground">
            {file ? "Arquivo carregado" : "Clique para selecionar o relatório de afastados (.TXT ou .CSV)"}
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
              <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">Conferência</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <StatCard label="Atualizados" value={preview.atualizados.length} cor="green" />
              <StatCard label="Sem mudança" value={preview.semMudanca} cor="neutral" />
              <StatCard label="Ambíguos" value={preview.ambiguos.length} cor="yellow" />
              <StatCard label="Possíveis retornos" value={preview.possiveisRetornos.length} cor="blue" />
              <StatCard label="Não encontrados" value={preview.naoEncontrados.length} cor="red" />
            </div>
          </div>

          {preview.possiveisRetornos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                Afastados no cadastro que não aparecem neste arquivo (podem ter retornado — revisar manualmente)
              </p>
              <Table containerClassName="max-h-[40vh] overflow-y-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Afastado desde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.possiveisRetornos.map((r) => (
                    <TableRow key={r.matricula}>
                      <TableCell>{r.matricula}</TableCell>
                      <TableCell className="font-medium text-foreground">{r.nome}</TableCell>
                      <TableCell>{r.empresaNome}</TableCell>
                      <TableCell>
                        {r.dataAfastamentoAtual ? new Date(r.dataAfastamentoAtual).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {preview.ambiguos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                Matrícula encontrada em mais de uma empresa — escolha manualmente
              </p>
              <Table containerClassName="max-h-[40vh] overflow-y-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Empresa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.ambiguos.map((a) => (
                    <TableRow key={a.matricula}>
                      <TableCell>{a.matricula}</TableCell>
                      <TableCell className="font-medium text-foreground">{a.nome}</TableCell>
                      <TableCell>
                        <Select
                          value={resolucoes[a.matricula] ?? ""}
                          onValueChange={(value) =>
                            setResolucoes((prev) => ({ ...prev, [a.matricula]: value as string }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione a empresa" />
                          </SelectTrigger>
                          <SelectContent>
                            {a.empresasPossiveis.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {preview.atualizados.length > 0 && (
            <Table containerClassName="max-h-[60vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Mudanças</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.atualizados.map((a) => (
                  <TableRow key={a.matricula}>
                    <TableCell>{a.matricula}</TableCell>
                    <TableCell className="font-medium text-foreground">{a.nome}</TableCell>
                    <TableCell>{a.empresaNome}</TableCell>
                    <TableCell className="whitespace-normal">{a.mudancas.join(" · ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.naoEncontrados.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                Matrículas do arquivo sem cadastro em nenhuma empresa
              </p>
              <Table containerClassName="max-h-[40vh] overflow-y-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.naoEncontrados.map((n) => (
                    <TableRow key={n.matricula}>
                      <TableCell>{n.matricula}</TableCell>
                      <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
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
            {ambiguosPendentes > 0 && (
              <p className="mb-2.5 font-mono text-[10px] text-warning">
                Resolva {ambiguosPendentes} matrícula(s) ambígua(s) antes de confirmar.
              </p>
            )}
            <div className="flex gap-2.5">
              <Button onClick={handleConfirmar} disabled={isPending || ambiguosPendentes > 0 || !competencia}>
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
