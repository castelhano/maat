"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewCadastro, confirmarCadastro, type PreviewCadastroResult } from "./cadastro-actions";
import { StatCard } from "./stat-card";
import { lerArquivoTexto } from "./ler-arquivo";

function Etapa({ numero, titulo }: { numero: string; titulo: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
        ETAPA {numero}
      </span>
      <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">{titulo}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function vrLabel(v: boolean | null) {
  return v === null ? "Cargo novo" : v ? "Recebe" : "Não recebe";
}

export function CadastroImportador({ competencia, onImportado }: { competencia: string; onImportado?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewCadastroResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);
    const texto = await lerArquivoTexto(f);
    setConteudo(texto);
    startTransition(async () => {
      const result = await previewCadastro(texto);
      if (result.error) {
        toast.error(result.error);
        handleCancelar();
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
      const result = await confirmarCadastro(conteudo, file.name, competencia);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const { criados, atualizados } = result.resumo!;
      const partes = [`${criados} criado(s)`, `${atualizados} atualizado(s)`];
      toast.success(`Cadastro importado: ${partes.join(" · ")}.`);
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
    <div className="flex flex-col gap-6">
      <div>
        <Etapa numero="01" titulo="Selecionar arquivo" />
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
            {file ? "Arquivo carregado" : "Clique para selecionar o relatório de cadastro (.TXT)"}
          </strong>
          {file && <span className="font-mono text-[10px] text-success">{file.name}</span>}
        </label>
      </div>

      {isPending && !preview && <p className="font-mono text-[11px] text-text-3">processando arquivo...</p>}

      {preview && (
        <>
          <div>
            <Etapa numero="02" titulo="Conferência" />
            <p className="mb-3 font-mono text-[11px] text-text-2">
              Empresa {preview.empresa.codigo} — {preview.empresa.nome}
              {preview.empresa.novaEmpresa && <span className="text-warning"> (nova, será cadastrada)</span>}
              {preview.ignoradosHistorico > 0 && (
                <span className="text-text-3"> · {preview.ignoradosHistorico} desligado(s) antes de 2026 ignorado(s)</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <StatCard label="Novos" value={preview.novos.length} cor="blue" />
              <StatCard label="Atualizados" value={preview.atualizados.length} cor="green" />
              <StatCard label="Sem mudança" value={preview.semMudanca} cor="neutral" />
              <StatCard label="Cargos VR" value={preview.cargosVR.length} cor="yellow" />
              <StatCard label="Fora do arquivo" value={preview.ausentesNoArquivo.length} cor="red" />
            </div>
          </div>

          {preview.cargosVR.length > 0 && (
            <Table containerClassName="max-h-[40vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Vale-refeição atual</TableHead>
                  <TableHead>Novo valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.cargosVR.map((c) => (
                  <TableRow key={c.nome}>
                    <TableCell className="font-medium text-foreground">{c.nome}</TableCell>
                    <TableCell>{vrLabel(c.atual)}</TableCell>
                    <TableCell>{vrLabel(c.novo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.novos.length > 0 && (
            <Table containerClassName="max-h-[40vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Salário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.novos.map((n) => (
                  <TableRow key={n.matricula}>
                    <TableCell>{n.matricula}</TableCell>
                    <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
                    <TableCell>{n.funcao}</TableCell>
                    <TableCell>{n.salario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.atualizados.length > 0 && (
            <Table containerClassName="max-h-[60vh] overflow-y-auto">
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

          {preview.ausentesNoArquivo.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                Ativos/afastados no sistema que não vieram no arquivo — o desligamento entra pela importação de
                Afastados e Desligados
              </p>
              <Table containerClassName="max-h-[40vh] overflow-y-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Situação atual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.ausentesNoArquivo.map((n) => (
                    <TableRow key={n.matricula}>
                      <TableCell>{n.matricula}</TableCell>
                      <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
                      <TableCell>{n.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div>
            <Etapa numero="03" titulo="Aplicar" />
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
