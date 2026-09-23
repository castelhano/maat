"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  previewMovimentacaoAprendiz,
  confirmarMovimentacaoAprendiz,
  type PreviewMovimentacaoResult,
} from "./movimentacao-actions";
import { StatCard } from "./stat-card";
import { lerArquivoTexto } from "./ler-arquivo";
import { labelSetor } from "@/lib/indicadores";

const TIPO_LABEL = { admitidos: "Admitidos", desligados: "Desligados" } as const;

export function MovimentacaoImportador({ onImportado }: { onImportado?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewMovimentacaoResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);

    const texto = await lerArquivoTexto(f);
    setConteudo(texto);
    startTransition(async () => {
      const result = await previewMovimentacaoAprendiz(texto);
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
      const result = await confirmarMovimentacaoAprendiz(conteudo, file.name);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const {
        competenciasAtualizadas,
        competenciasSemIndicador,
        funcionariosDesligados,
        funcionariosNaoEncontrados,
        transferenciaComOnus,
      } = result.resumo!;
      const partes = [`${competenciasAtualizadas} competência(s) atualizada(s)`];
      if (competenciasSemIndicador > 0) partes.push(`${competenciasSemIndicador} sem indicador importado ainda`);
      if (funcionariosDesligados > 0) partes.push(`${funcionariosDesligados} funcionário(s) marcado(s) como desligado`);
      if (funcionariosNaoEncontrados > 0) partes.push(`${funcionariosNaoEncontrados} matrícula(s) não encontrada(s)`);
      if (transferenciaComOnus > 0) partes.push(`${transferenciaComOnus} desligado(s) por transferência (com ônus) excluído(s) do turnover`);
      toast.success(partes.join(" — ") + ".");
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

  const semIndicador = preview?.linhas.filter((l) => !l.indicadorExiste).length ?? 0;
  const totalAprendizes = preview?.linhas.reduce((soma, l) => soma + l.quantidade, 0) ?? 0;
  const totalTransferencia = preview?.transferenciaComOnus.reduce((soma, t) => soma + t.quantidade, 0) ?? 0;

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
        <p className="mb-3 font-mono text-[10px] text-text-3">
          aceita o relatório de Admitidos OU o de Desligados, em CSV (preferido — traz matrícula completa e sincroniza
          o cadastro de Funcionário) ou TXT — importe os dois separadamente quando tiver ambos.
        </p>

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
            {file ? "Arquivo carregado" : "Clique para selecionar o relatório (.TXT)"}
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
            <p className="mb-4 font-mono text-[10px] text-text-3">
              {preview.empresaNome} · relatório de {TIPO_LABEL[preview.tipo]} · {preview.totalLinhasArquivo} linha(s) no
              arquivo — contagem de aprendiz entra no indicador
              {preview.syncFuncionarios && " e o cadastro de Funcionário é atualizado (status desligado)"}.
            </p>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <StatCard label={`Aprendizes ${TIPO_LABEL[preview.tipo].toLowerCase()}`} value={totalAprendizes} cor="green" />
              <StatCard label="Competências no arquivo" value={preview.linhas.length} cor="neutral" />
              <StatCard label="Sem indicador importado" value={semIndicador} cor="yellow" />
            </div>
          </div>

          {preview.linhas.length > 0 && (
            <Table containerClassName="max-h-[50vh] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead>Aprendizes {TIPO_LABEL[preview.tipo].toLowerCase()}</TableHead>
                  <TableHead>Indicador já importado?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.linhas.map((l) => (
                  <TableRow key={l.competencia}>
                    <TableCell>{l.competencia}</TableCell>
                    <TableCell className="font-medium text-foreground">{l.quantidade}</TableCell>
                    <TableCell className={l.indicadorExiste ? "text-success" : "text-warning"}>
                      {l.indicadorExiste ? "Sim" : "Não — importe o Resumo Gerencial dessa competência antes"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.tipo === "desligados" && totalTransferencia > 0 && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <StatCard label="Desligados por transferência (com ônus)" value={totalTransferencia} cor="yellow" />
              </div>
              <p className="font-mono text-[10px] text-text-3">
                Esses desligamentos não entram no cálculo de turnover (excluídos automaticamente).
              </p>
              <Table containerClassName="max-h-[30vh] overflow-y-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.transferenciaComOnus.map((t) => (
                    <TableRow key={`${t.competencia}-${t.setor}`}>
                      <TableCell>{t.competencia}</TableCell>
                      <TableCell className="font-medium text-foreground">{labelSetor(t.setor)}</TableCell>
                      <TableCell>{t.quantidade}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {preview.syncFuncionarios && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <StatCard label="Funcionários a marcar como desligado" value={preview.syncFuncionarios.paraAtualizar.length} cor="green" />
                <StatCard label="Já estavam desligados" value={preview.syncFuncionarios.jaDesligados} cor="neutral" />
                <StatCard label="Matrícula/nome não encontrado" value={preview.syncFuncionarios.naoEncontrados.length} cor="red" />
              </div>

              {preview.syncFuncionarios.paraAtualizar.some((p) => p.diaAproximado) && (
                <p className="font-mono text-[10px] text-warning">
                  Esse arquivo (TXT) não traz o dia exato do desligamento — vai ser gravado como dia 1 do mês. Confira e
                  ajuste o dia certo depois em Funcionários, principalmente pra quem saiu perto do fim do mês (isso muda
                  o cálculo do vale-alimentação daquele mês).
                </p>
              )}

              {preview.syncFuncionarios.naoEncontrados.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[10px] tracking-[.06em] text-warning uppercase">
                    Matrículas do arquivo sem cadastro nessa empresa
                  </p>
                  <Table containerClassName="max-h-[30vh] overflow-y-auto">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Nome</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.syncFuncionarios.naoEncontrados.map((n) => (
                        <TableRow key={n.matricula}>
                          <TableCell>{n.matricula}</TableCell>
                          <TableCell className="font-medium text-foreground">{n.nome}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
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
            {semIndicador > 0 && (
              <p className="mb-2.5 font-mono text-[10px] text-warning">
                {semIndicador} competência(s) ainda sem indicador importado — a contagem dessas ficará pendente até você
                importar o Resumo Gerencial e reimportar este relatório.
              </p>
            )}
            <div className="flex gap-2.5">
              <Button
                onClick={handleConfirmar}
                disabled={
                  isPending ||
                  (preview.linhas.length === 0 &&
                    (preview.syncFuncionarios?.paraAtualizar.length ?? 0) === 0 &&
                    totalTransferencia === 0)
                }
              >
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
