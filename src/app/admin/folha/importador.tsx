"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lerArquivoTexto } from "@/app/admin/importar/ler-arquivo";
import { parseFolhaPagamento, type FolhaPagamentoParseResult, type TipoFolha } from "@/lib/parsers/folha-pagamento";
import { ehArquivoConsignado, parseConsignado, type ConsignadoParseResult } from "@/lib/parsers/econsignado";
import { confirmarFolha, previewFolha, type PreviewFolha } from "./actions";
import { confirmarConsignado, previewConsignado, type PreviewConsignado } from "./consignado-actions";
import { StatCard } from "./stat-card";

const ROTULO_TIPO: Record<TipoFolha, string> = {
  mensal: "folha mensal",
  "13_1": "13º salário — 1ª parcela",
  "13_2": "13º salário — 2ª parcela",
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Recebe o TXT da folha (mensal ou 13º) ou o CSV do e-Consignado — o tipo é reconhecido pelo conteúdo.
export function ImportadorFolha({
  onImportado,
  onConsignadoImportado,
}: {
  onImportado: (empresaId: string, competencia: string, tipo: TipoFolha) => void;
  onConsignadoImportado?: (empresaId: string, competencia: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dados, setDados] = useState<FolhaPagamentoParseResult | null>(null);
  const [preview, setPreview] = useState<PreviewFolha | null>(null);
  const [consignado, setConsignado] = useState<ConsignadoParseResult | null>(null);
  const [previewCons, setPreviewCons] = useState<PreviewConsignado | null>(null);
  const [isPending, startTransition] = useTransition();

  function limpar() {
    setFile(null);
    setDados(null);
    setPreview(null);
    setConsignado(null);
    setPreviewCons(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);
    setPreviewCons(null);
    const conteudo = await lerArquivoTexto(f);

    if (ehArquivoConsignado(conteudo)) {
      let parsed: ConsignadoParseResult;
      try {
        parsed = parseConsignado(conteudo);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao ler o arquivo do e-Consignado.");
        limpar();
        return;
      }
      setConsignado(parsed);
      startTransition(async () => {
        const result = await previewConsignado(parsed);
        if (result.error) {
          toast.error(result.error);
          limpar();
          return;
        }
        setPreviewCons(result.data);
      });
      return;
    }

    let parsed: FolhaPagamentoParseResult;
    try {
      parsed = parseFolhaPagamento(conteudo);
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
    if (!file) return;
    if (consignado) {
      startTransition(async () => {
        const result = await confirmarConsignado(consignado, file.name);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(`E-Consignado ${consignado.competencia} importado: ${consignado.contratos.length} contrato(s).`);
        limpar();
        onConsignadoImportado?.(result.empresaId!, result.competencia!);
      });
      return;
    }
    if (!dados) return;
    startTransition(async () => {
      const result = await confirmarFolha(dados, file.name);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${dados.tipo === "mensal" ? "Folha" : ROTULO_TIPO[dados.tipo]} ${dados.competencia} importada: ${dados.funcionarios.length} funcionário(s).`,
      );
      limpar();
      onImportado(result.empresaId!, result.competencia!, result.tipo ?? "mensal");
    });
  }

  const botoes = (
    <div className="flex gap-2.5">
      <Button onClick={handleConfirmar} disabled={isPending}>
        {isPending ? "Gravando..." : "Confirmar importação"}
      </Button>
      <Button variant="secondary" onClick={limpar} disabled={isPending}>
        Cancelar
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
          IMPORTAR
        </span>
        <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">
          Folha / 13º salário do ERP (.TXT) ou arquivo do e-Consignado (.CSV)
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
          accept=".txt,.TXT,.csv,.CSV"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? <CheckCircle2 className="size-[22px] text-success" /> : <Upload className="size-[22px] text-text-3" />}
        <strong className="text-xs font-medium text-foreground">
          {file ? "Arquivo carregado" : "Clique para selecionar o arquivo (.TXT da folha ou .CSV do e-Consignado)"}
        </strong>
        {file && <span className="font-mono text-[10px] text-success">{file.name}</span>}
      </label>

      {isPending && !preview && !previewCons && <p className="font-mono text-[11px] text-text-3">conferindo o arquivo...</p>}

      {previewCons && (
        <>
          <p className="font-mono text-[11px] text-text-2">
            {previewCons.empresaNome} · <span className="text-foreground">e-Consignado</span> · competência{" "}
            <span className="text-foreground">{previewCons.competencia}</span> · {previewCons.contratos} contrato(s) de{" "}
            {previewCons.pessoas} colaborador(es) · parcelas R$ {moeda(previewCons.totalParcelas)}
          </p>
          {previewCons.resumo ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatCard label="Com erro" value={previewCons.resumo.erro} cor="red" />
              <StatCard label="Com alerta" value={previewCons.resumo.alerta} cor="yellow" />
              <StatCard label="Não descontado" value={moeda(previewCons.resumo.naoDescontado)} cor="neutral" />
              <StatCard label="Descontado certo" value={previewCons.resumo.ok} cor="green" />
            </div>
          ) : (
            <p className="font-mono text-[11px] text-warning">
              A folha mensal de {previewCons.competencia} ainda não foi importada — a comparação aparece assim que ela for importada.
            </p>
          )}
          {previewCons.jaImportado && (
            <p className="font-mono text-[11px] text-warning">
              O e-Consignado de {previewCons.competencia} já foi importado — confirmar vai substituir pelo arquivo novo.
            </p>
          )}
          {botoes}
        </>
      )}

      {preview && (
        <>
          <p className="font-mono text-[11px] text-text-2">
            {preview.empresa.nome} · <span className="text-foreground">{ROTULO_TIPO[preview.tipo]}</span>
            {preview.simulado ? " (simulado)" : ""} · competência <span className="text-foreground">{preview.competencia}</span> ·{" "}
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
              {preview.tipo === "mensal" ? "A folha" : `O ${ROTULO_TIPO[preview.tipo]}`} de {preview.competencia} já foi importad
              {preview.tipo === "mensal" ? "a" : "o"} — confirmar vai substituir pelo arquivo novo.
            </p>
          )}
          {botoes}
        </>
      )}
    </div>
  );
}
