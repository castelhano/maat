"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { CompetenciaSelect } from "@/components/competencia-select";
import { competenciaPadrao } from "@/lib/competencia";
import { Importador as FolhaImportador } from "../importar-folha/importador";
import { SituacaoImportador } from "./situacao-importador";
import { FaltasImportador } from "./faltas-importador";
import { AfastamentosImportador } from "./afastamentos-importador";
import { statusImportacoes, type StatusImportacoes } from "./status-actions";

type Empresa = { id: string; nome: string };

type TipoDef = {
  key: string;
  titulo: string;
  caminhoErp: string;
  descricao: string;
};

const TIPOS: TipoDef[] = [
  {
    key: "folha_salarios",
    titulo: "Folha de salários",
    caminhoErp: "Folha > Relatórios > Listagem Auxiliares Funcionários > Relação Salario II",
    descricao: "cadastra e sincroniza cargo, salário e admissão",
  },
  {
    key: "situacao_vale_refeicao",
    titulo: "Situação & vale-refeição",
    caminhoErp: "Folha > Listagem Genérica > [ 996 ] > Campos (Cod;Sit;CPF;Func;ValeR;NomeC;Fone)",
    descricao: "atualiza status e elegibilidade de VR de quem já existe",
  },
  {
    key: "faltas",
    titulo: "Faltas",
    caminhoErp: "Frequencia > Listagem > Analise de Ocorrencia > [ evento 21 ]",
    descricao: "registra as datas de falta do período",
  },
  {
    key: "afastamentos",
    titulo: "Afastamentos",
    caminhoErp: "Folha > Listagem generica > [ 003 ]",
    descricao: "atualiza status, data e motivo de quem está afastado",
  },
];

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function ImportacaoCentral({ empresas }: { empresas: Empresa[] }) {
  const padrao = competenciaPadrao();
  const [mes, setMes] = useState(padrao.mes);
  const [ano, setAno] = useState(padrao.ano);
  const [aberto, setAberto] = useState<string | null>("folha_salarios");
  const [status, setStatus] = useState<StatusImportacoes>({});
  const [isPending, startTransition] = useTransition();

  const competencia = mes && ano ? `${mes}/${ano}` : "";

  function recarregarStatus(comp: string) {
    startTransition(async () => {
      const result = await statusImportacoes(comp);
      setStatus(result);
    });
  }

  useEffect(() => {
    if (competencia) recarregarStatus(competencia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMesChange(valor: string) {
    setMes(valor);
    const comp = valor && ano ? `${valor}/${ano}` : "";
    if (comp) recarregarStatus(comp);
    else setStatus({});
  }

  function handleAnoChange(valor: string) {
    setAno(valor);
    const comp = mes && valor ? `${mes}/${valor}` : "";
    if (comp) recarregarStatus(comp);
    else setStatus({});
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <CompetenciaSelect mes={mes} ano={ano} onMesChange={handleMesChange} onAnoChange={handleAnoChange} />
        <p className="font-mono text-[10px] text-text-3">define pra qual mês esta importação conta</p>
      </div>

      <div className="flex flex-col gap-3">
        {TIPOS.map((tipo) => {
          const empresasImportadas = status[tipo.key]?.empresasImportadas ?? [];
          const pendentes = empresas.filter((e) => !empresasImportadas.some((i) => i.id === e.id));
          const estaAberto = aberto === tipo.key;

          return (
            <div key={tipo.key} className="rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => setAberto(estaAberto ? null : tipo.key)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[12px] font-bold tracking-[.04em] text-foreground">{tipo.titulo}</span>
                  <span className="font-mono text-[10px] text-text-3">
                    <span className="font-bold text-primary">{tipo.caminhoErp}</span> · {tipo.descricao}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {competencia && (
                    <span className="font-mono text-[10px] text-text-3">
                      {empresasImportadas.length} de {empresas.length} empresa(s) cobertas
                    </span>
                  )}
                  <ChevronDown className={`size-4 text-text-3 transition-transform ${estaAberto ? "rotate-180" : ""}`} />
                </div>
              </button>

              {estaAberto && (
                <div className="border-t border-border px-4 py-5">
                  {!competencia && (
                    <p className="mb-4 font-mono text-[10px] text-warning">
                      Selecione a competência acima antes de importar.
                    </p>
                  )}

                  {competencia && empresasImportadas.length > 0 && (
                    <div className="mb-5 flex flex-col gap-1.5">
                      <p className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">
                        já importado nesta competência
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {empresasImportadas.map((e) => (
                          <span
                            key={e.id}
                            className="rounded-[3px] border border-success/30 bg-success-dim px-2 py-0.5 font-mono text-[9px] font-bold tracking-[.06em] text-success"
                            title={`importado em ${formatarData(e.importadoEm)}`}
                          >
                            {e.nome}
                          </span>
                        ))}
                      </div>
                      {pendentes.length > 0 && (
                        <p className="mt-1 font-mono text-[9px] text-text-3">
                          pendentes: {pendentes.map((p) => p.nome).join(", ")}
                        </p>
                      )}
                    </div>
                  )}

                  {tipo.key === "folha_salarios" && (
                    <FolhaImportador onImportado={() => competencia && recarregarStatus(competencia)} />
                  )}
                  {tipo.key === "situacao_vale_refeicao" && (
                    <SituacaoImportador
                      competencia={competencia}
                      onImportado={() => competencia && recarregarStatus(competencia)}
                    />
                  )}
                  {tipo.key === "faltas" && (
                    <FaltasImportador
                      competencia={competencia}
                      onImportado={() => competencia && recarregarStatus(competencia)}
                    />
                  )}
                  {tipo.key === "afastamentos" && (
                    <AfastamentosImportador
                      competencia={competencia}
                      onImportado={() => competencia && recarregarStatus(competencia)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isPending && <p className="font-mono text-[10px] text-text-3">atualizando status...</p>}
    </div>
  );
}
