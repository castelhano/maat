"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { CompetenciaSelect } from "@/components/competencia-select";
import { competenciaPadrao } from "@/lib/competencia";
import { CadastroImportador } from "./cadastro-importador";
import { FaltasImportador } from "./faltas-importador";
import { AfastamentosImportador } from "./afastamentos-importador";
import { CatImportador } from "./cat-importador";
import { IndicadoresImportador } from "./indicadores-importador";
import { MovimentacaoImportador } from "./movimentacao-importador";
import { statusImportacoes, type StatusImportacoes, type StatusImportacaoTipo } from "./status-actions";

type Empresa = { id: string; nome: string };

type TipoDef = {
  key: string;
  titulo: string;
  caminhoErp: string;
  descricao: string;
  // Tipos de Importacao gravados por essa importação (a de afastados e desligados grava dois).
  tiposStatus: string[];
};

const TIPOS: TipoDef[] = [
  {
    key: "cadastro",
    titulo: "Cadastro",
    caminhoErp: "Folha > Relatórios > Listagem Generica > 992",
    descricao: "cadastra e atualiza funcionários — nome, CPF, telefone, admissão, função, salário, situação e VR da função",
    tiposStatus: ["cadastro"],
  },
  {
    key: "afastados_desligados",
    titulo: "Afastados e Desligados",
    caminhoErp: "Folha > Relatórios > Controle de datas",
    descricao: "datas e motivos de afastamento/retorno e de desligamento (inclui aprendizes e transferência com ônus)",
    tiposStatus: ["afastamentos", "movimentacao_aprendiz_desligados"],
  },
  {
    key: "faltas",
    titulo: "Ocorrência",
    caminhoErp: "Frequencia > Listagem > Analise de Ocorrencia > (8;11;12;21;30;36;37;59)",
    descricao: "registra as datas de falta do período",
    tiposStatus: ["faltas"],
  },
  {
    key: "indicadores_mensais",
    titulo: "Indicadores mensais (Resumo Gerencial)",
    caminhoErp: "Folha > Relatórios > Resumo Gerencial Analítico",
    descricao: "alimenta o dashboard de indicadores por área — headcount, folha, encargos e benefícios",
    tiposStatus: ["indicadores_mensais"],
  },
  {
    key: "cat",
    titulo: "CAT (acidentes de trabalho)",
    caminhoErp: "Folha > Relatórios > Listagem Genérica > 7",
    descricao: "guarda os acidentes reportados — ainda sem indicador montado em cima",
    tiposStatus: ["cat"],
  },
];

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

// Junta as empresas importadas nos tipos do card, ficando com a importação mais recente de cada.
function empresasDoTipo(status: StatusImportacoes, tipos: string[]): StatusImportacaoTipo["empresasImportadas"] {
  const porEmpresa = new Map<string, StatusImportacaoTipo["empresasImportadas"][number]>();
  for (const t of tipos) {
    for (const e of status[t]?.empresasImportadas ?? []) {
      const atual = porEmpresa.get(e.id);
      if (!atual || e.importadoEm > atual.importadoEm) porEmpresa.set(e.id, e);
    }
  }
  return [...porEmpresa.values()];
}

export function ImportacaoCentral({ empresas }: { empresas: Empresa[] }) {
  const padrao = competenciaPadrao();
  const [mes, setMes] = useState(padrao.mes);
  const [ano, setAno] = useState(padrao.ano);
  const [aberto, setAberto] = useState<string | null>("cadastro");
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

  function recarregar() {
    if (competencia) recarregarStatus(competencia);
  }

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
          const empresasImportadas = empresasDoTipo(status, tipo.tiposStatus);
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
                  {!competencia && tipo.key !== "cat" && tipo.key !== "indicadores_mensais" && (
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

                  {tipo.key === "cadastro" && (
                    <CadastroImportador competencia={competencia} onImportado={recarregar} />
                  )}
                  {tipo.key === "afastados_desligados" && (
                    <div className="flex flex-col gap-8">
                      <div className="flex flex-col gap-3">
                        <p className="font-mono text-[11px] font-bold tracking-[.08em] text-foreground uppercase">
                          Afastados <span className="font-normal text-text-3">· afastaram ou retornaram (.CSV) ou situação atual (.TXT)</span>
                        </p>
                        <AfastamentosImportador competencia={competencia} onImportado={recarregar} />
                      </div>
                      <div className="flex flex-col gap-3 border-t border-border pt-6">
                        <p className="font-mono text-[11px] font-bold tracking-[.08em] text-foreground uppercase">
                          Desligados <span className="font-normal text-text-3">· listagem de demitidos (.CSV ou .TXT)</span>
                        </p>
                        <MovimentacaoImportador onImportado={recarregar} />
                      </div>
                    </div>
                  )}
                  {tipo.key === "faltas" && <FaltasImportador competencia={competencia} onImportado={recarregar} />}
                  {tipo.key === "indicadores_mensais" && <IndicadoresImportador onImportado={recarregar} />}
                  {tipo.key === "cat" && <CatImportador onImportado={recarregar} />}
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
