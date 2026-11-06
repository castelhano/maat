"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, FileSignature, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { paraCsv, baixarCsv } from "@/lib/csv";
import { STATUS_SITUACAO, type SituacaoConsignado } from "@/lib/folha/consignado";
import { buscarComparativoConsignado, type ComparativoConsignado } from "./consignado-actions";
import { StatCard } from "./stat-card";

const ROTULO_SITUACAO: Record<SituacaoConsignado, string> = {
  ok: "Descontado",
  parcial_limite: "Parcial — limite 35%",
  sem_remuneracao: "Sem remuneração",
  rescisao_sem_desconto: "Rescisão — ver garantia",
  nao_descontado: "Não descontado",
  descontado_a_mais: "Descontado a mais",
  desconto_sem_contrato: "Desconto sem contrato",
  fora_da_folha: "Fora da folha",
  sem_cadastro: "Sem cadastro",
};
const VARIANTE = { ok: "success", alerta: "warning", erro: "destructive", pendente: "default" } as const;
// Situações em que o colaborador precisa ser chamado para assinar o termo de ciência.
const GERA_TERMO: SituacaoConsignado[] = ["parcial_limite", "sem_remuneracao"];

const moeda = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// Parcelas do arquivo do e-Consignado x desconto da folha mensal, por colaborador.
export function ComparativoConsignadoView({ empresaId, competencia }: { empresaId: string; competencia: string }) {
  const [dados, setDados] = useState<ComparativoConsignado | null>(null);
  const [carregando, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<"todos" | "ok" | "alerta" | "erro" | "pendente">("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    startTransition(async () => setDados(await buscarComparativoConsignado(empresaId, competencia)));
  }, [empresaId, competencia]);

  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () =>
      (dados?.linhas ?? [])
        .filter((l) => filtro === "todos" || STATUS_SITUACAO[l.situacao] === filtro)
        .filter((l) => !termo || l.nome.toLowerCase().includes(termo) || (l.matricula ?? "").includes(termo)),
    [dados, filtro, termo],
  );

  if (carregando && !dados) return <p className="font-mono text-[11px] text-text-3">carregando e-consignado...</p>;
  if (!dados) return null;
  if (!dados.importado) {
    return (
      <p className="font-mono text-[11px] text-warning">
        O arquivo do e-Consignado de {competencia} desta empresa ainda não foi importado. Importe o CSV no quadro acima e a comparação
        aparece aqui.
      </p>
    );
  }
  if (!dados.folhaImportada || !dados.resumo) {
    return <p className="font-mono text-[11px] text-warning">A folha mensal de {competencia} ainda não foi importada.</p>;
  }

  function exportar() {
    baixarCsv(
      `e-consignado-x-folha-${competencia.replace("/", "-")}`,
      paraCsv(
        [
          "Matrícula",
          "Nome",
          "CPF",
          "Contratos",
          "Parcelas (R$)",
          "Descontado (R$)",
          "Não descontado (R$)",
          "Limite 35% (R$)",
          "Situação",
          "Detalhe",
        ],
        visiveis.map((l) => [
          l.matricula ?? "",
          l.nome,
          l.cpf,
          l.contratos.map((c) => `${c.banco} ${c.contrato} ${moeda(c.valorParcela)}`).join(" | "),
          l.previsto,
          l.descontado,
          l.naoDescontado,
          l.limite ?? "",
          ROTULO_SITUACAO[l.situacao],
          l.detalhe,
        ]),
      ),
    );
  }

  const r = dados.resumo;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
        <StatCard label="Colaboradores" value={r.pessoas} cor="neutral" ativo={filtro === "todos"} onClick={() => setFiltro("todos")} />
        <StatCard label="Descontado certo" value={r.ok} cor="green" ativo={filtro === "ok"} onClick={() => setFiltro("ok")} />
        <StatCard label="Alerta (chamar)" value={r.alerta} cor="yellow" ativo={filtro === "alerta"} onClick={() => setFiltro("alerta")} />
        <StatCard label="Erro" value={r.erro} cor="red" ativo={filtro === "erro"} onClick={() => setFiltro("erro")} />
        <StatCard label="Pendente" value={r.pendente} cor="blue" ativo={filtro === "pendente"} onClick={() => setFiltro("pendente")} />
        <StatCard label="Não descontado (R$)" value={moeda(r.naoDescontado)} cor="neutral" />
      </div>
      <p className="font-mono text-[10px] tracking-[.04em] text-text-3">
        arquivo {dados.nomeArquivo} · importado em {dados.importadoEm ? new Date(dados.importadoEm).toLocaleString("pt-BR") : "—"} · limite
        de 35% de (remuneração − INSS − IR) · colaboradores ligados pelo CPF do cadastro
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label>Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-3" />
            <Input className="w-64 pl-8" placeholder="Nome ou matrícula" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={exportar}>
          <Download />
          Exportar lista
        </Button>
      </div>

      <Table containerClassName="max-h-[70vh] overflow-y-auto">
        <TableHeader className="sticky top-0 z-10">
          <TableRow>
            <TableHead>Matrícula</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead className="text-right">Contratos</TableHead>
            <TableHead className="text-right">Parcelas</TableHead>
            <TableHead className="text-right">Descontado</TableHead>
            <TableHead className="text-right">Não descontado</TableHead>
            <TableHead className="text-right">Limite 35%</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiveis.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-6 text-center font-mono text-[11px] text-text-3">
                Nenhum colaborador com esse filtro.
              </TableCell>
            </TableRow>
          )}
          {visiveis.map((l) => (
            <TableRow key={`${l.cpf}-${l.matricula}`}>
              <TableCell className="font-mono">{l.matricula ?? "—"}</TableCell>
              <TableCell className="max-w-sm whitespace-normal">
                <div className="text-foreground">{l.nome}</div>
                <div className="font-mono text-[10px] text-text-3">{l.contratos.map((c) => c.banco).join(" · ")}</div>
                {l.situacao !== "ok" && <div className="mt-1 text-[11px] text-text-2">{l.detalhe}</div>}
              </TableCell>
              <TableCell className="text-right font-mono">{l.contratos.length}</TableCell>
              <TableCell className="text-right font-mono">{moeda(l.previsto)}</TableCell>
              <TableCell className="text-right font-mono">{moeda(l.descontado)}</TableCell>
              <TableCell className={`text-right font-mono ${l.naoDescontado > 0.05 ? "text-danger" : ""}`}>
                {moeda(l.naoDescontado)}
              </TableCell>
              <TableCell className="text-right font-mono">{moeda(l.limite)}</TableCell>
              <TableCell>
                <Badge variant={VARIANTE[STATUS_SITUACAO[l.situacao]]}>{ROTULO_SITUACAO[l.situacao]}</Badge>
              </TableCell>

              <TableCell>
                {GERA_TERMO.includes(l.situacao) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/admin/folha/termo-consignado?${new URLSearchParams({ empresaId, competencia, cpf: l.cpf }).toString()}`,
                        "_blank",
                      )
                    }
                  >
                    <FileSignature />
                    Gerar termo
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
