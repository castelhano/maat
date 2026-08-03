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
import { confirmarImportacao, previewImportacao, type PreviewResult } from "./actions";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

export function Importador() {
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
      // Relatórios do ERP costumam vir em Windows-1252/Latin-1; se os bytes não
      // forem UTF-8 válido, decode "fatal" estoura e caímos no fallback abaixo.
      texto = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      texto = new TextDecoder("windows-1252").decode(buffer);
    }

    setConteudo(texto);
    startTransition(async () => {
      const result = await previewImportacao(texto);
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
      const result = await confirmarImportacao(conteudo, file.name);
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
            {file ? "Arquivo carregado" : "Clique para selecionar o relatório de salários (.TXT)"}
          </strong>
          {file && (
            <span className="font-mono text-[10px] text-success">{file.name}</span>
          )}
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
                Conferência — {preview.empresa.nome} · {preview.competencia}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <StatCard label="Novos" value={preview.novos.length} cor="blue" />
              <StatCard label="Atualizados" value={preview.atualizados.length} cor="green" />
              <StatCard label="Sem mudança" value={preview.semMudanca} cor="neutral" />
              <StatCard label="Cargos novos" value={preview.cargosNovos.length} cor="blue" />
              <StatCard label="Não encontrados" value={preview.naoEncontrados.length} cor="yellow" />
            </div>
          </div>

          {preview.empresa.novaEmpresa && (
            <p className="font-mono text-[11px] text-text-2">
              Empresa <span className="text-foreground">{preview.empresa.nome}</span> (código{" "}
              {preview.empresa.codigo}) ainda não existe — será criada nesta importação.
            </p>
          )}

          {preview.cargosNovos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {preview.cargosNovos.map((c) => (
                <span
                  key={c}
                  className="rounded-[3px] border border-border bg-bg-4 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[.06em] text-text-3 uppercase"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {preview.novos.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Salário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.novos.map((n) => (
                  <TableRow key={n.matricula}>
                    <TableCell>{n.matricula}</TableCell>
                    <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
                    <TableCell>{n.funcao}</TableCell>
                    <TableCell>{formatarMoeda(n.salario)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.atualizados.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Mudanças</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.atualizados.map((a) => (
                  <TableRow key={a.matricula}>
                    <TableCell>{a.matricula}</TableCell>
                    <TableCell className="font-medium text-foreground">{a.nome}</TableCell>
                    <TableCell className="whitespace-normal">{a.mudancas.join(" · ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.naoEncontrados.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                Cadastrados que não apareceram neste arquivo (revisar antes de desligar manualmente)
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cargo atual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.naoEncontrados.map((n) => (
                    <TableRow key={n.matricula}>
                      <TableCell>{n.matricula}</TableCell>
                      <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
                      <TableCell>{n.cargo}</TableCell>
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
              <Button onClick={handleConfirmar} disabled={isPending}>
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
