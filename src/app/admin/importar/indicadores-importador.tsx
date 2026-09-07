"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  previewIndicadores,
  confirmarIndicadores,
  type PreviewIndicadoresResult,
  type IndicadorLinhaEditada,
} from "./indicadores-actions";
import { CAMPOS_INDICADOR, CAMPO_LABEL, labelSetor, type CampoIndicador } from "@/lib/indicadores";

function arquivoParaBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result as string;
      // "data:application/pdf;base64,AAAA..." — só o trecho depois da vírgula interessa.
      resolve(resultado.slice(resultado.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });
}

type LinhaEdicao = { setor: string; camposManuais: Set<CampoIndicador> } & Record<CampoIndicador, string>;

function linhasParaEdicao(preview: PreviewIndicadoresResult): LinhaEdicao[] {
  return preview.linhas.map((linha) => {
    const camposManuais = new Set<CampoIndicador>();
    const valores = {} as Record<CampoIndicador, string>;
    for (const campo of CAMPOS_INDICADOR) {
      if (linha[campo] === null) camposManuais.add(campo);
      // Campo não encontrado no PDF entra zerado (não bloqueia a confirmação) — só fica marcado
      // em amarelo pra avisar que não veio do relatório, caso o usuário queira conferir/corrigir.
      valores[campo] = linha[campo] === null ? "0" : String(linha[campo]);
    }
    return { setor: linha.setor, camposManuais, ...valores };
  });
}

export function IndicadoresImportador({ onImportado }: { onImportado?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewIndicadoresResult | null>(null);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>([]);
  const [isPending, startTransition] = useTransition();

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);
    setLinhas([]);

    const base64 = await arquivoParaBase64(f);
    startTransition(async () => {
      const result = await previewIndicadores(base64);
      if (result.error) {
        toast.error(result.error);
        setFile(null);
        return;
      }
      setPreview(result.data);
      setLinhas(linhasParaEdicao(result.data!));
    });
  }

  function handleCampoChange(setor: string, campo: CampoIndicador, valor: string) {
    setLinhas((prev) => prev.map((l) => (l.setor === setor ? { ...l, [campo]: valor } : l)));
  }

  const todosValidos = linhas.every((l) => CAMPOS_INDICADOR.every((c) => l[c].trim() !== "" && !Number.isNaN(Number(l[c]))));

  function handleConfirmar() {
    if (!preview || !file || !todosValidos) return;

    const linhasEditadas: IndicadorLinhaEditada[] = linhas.map((l) => {
      const valores = {} as Record<CampoIndicador, number>;
      for (const campo of CAMPOS_INDICADOR) valores[campo] = Number(l[campo]);
      return { setor: l.setor, camposManuais: [...l.camposManuais], ...valores };
    });

    startTransition(async () => {
      const result = await confirmarIndicadores(preview.empresaId, preview.competencia, file.name, linhasEditadas);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Indicadores gravados: ${result.resumo?.gravados} área(s) — competência ${preview.competencia}.`);
      handleCancelar();
      onImportado?.();
    });
  }

  function handleCancelar() {
    setFile(null);
    setPreview(null);
    setLinhas([]);
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
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {file ? <CheckCircle2 className="size-[22px] text-success" /> : <Upload className="size-[22px] text-text-3" />}
          <strong className="text-xs font-medium text-foreground">
            {file ? "Arquivo carregado" : "Clique para selecionar o Resumo Gerencial Analítico (.PDF)"}
          </strong>
          {file && <span className="font-mono text-[10px] text-success">{file.name}</span>}
        </label>
      </div>

      {isPending && !preview && <p className="font-mono text-[11px] text-text-3">processando PDF...</p>}

      {preview && (
        <>
          <div>
            <div className="mb-3.5 flex items-center gap-2.5">
              <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
                ETAPA 02
              </span>
              <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">
                Conferência e edição
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <p className="mb-4 font-mono text-[10px] text-text-3">
              {preview.empresaNome} · competência {preview.competencia} — campos em{" "}
              <span className="text-warning">amarelo</span> não vieram do PDF e entraram zerados — confira e corrija se precisar.
            </p>

            <Table containerClassName="max-h-[60vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Área</TableHead>
                  {CAMPOS_INDICADOR.map((campo) => (
                    <TableHead key={campo}>{CAMPO_LABEL[campo]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((linha) => (
                  <TableRow key={linha.setor}>
                    <TableCell className="font-medium whitespace-nowrap text-foreground">
                      {labelSetor(linha.setor)}
                    </TableCell>
                    {CAMPOS_INDICADOR.map((campo) => (
                      <TableCell key={campo}>
                        <Input
                          value={linha[campo]}
                          onChange={(e) => handleCampoChange(linha.setor, campo, e.target.value)}
                          inputMode="decimal"
                          className={`w-28 ${linha.camposManuais.has(campo) ? "border-warning" : ""}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-bold whitespace-nowrap text-foreground">Total</TableCell>
                  {CAMPOS_INDICADOR.map((campo) => (
                    <TableCell key={campo} className="font-bold text-foreground">
                      {linhas
                        .reduce((soma, l) => soma + (Number(l[campo]) || 0), 0)
                        .toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
            <p className="mt-2 font-mono text-[10px] text-text-3">
              confira a linha Total contra o bloco &quot;TOTAL DA EMPRESA&quot; do relatório.
            </p>
          </div>

          <div>
            <div className="mb-3.5 flex items-center gap-2.5">
              <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
                ETAPA 03
              </span>
              <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">Aplicar</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {!todosValidos && (
              <p className="mb-2.5 font-mono text-[10px] text-warning">Algum campo está vazio ou com valor inválido — corrija antes de confirmar.</p>
            )}
            <div className="flex gap-2.5">
              <Button onClick={handleConfirmar} disabled={isPending || !todosValidos}>
                <FileText />
                {isPending ? "Gravando..." : "Confirmar importação"}
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
