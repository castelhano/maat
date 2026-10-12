"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Download, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePodeOperar } from "@/components/permissoes-provider";
import { paraCsv, baixarCsv } from "@/lib/csv";
import type { Categoria, Critica, ResultadoFuncionario, StatusCritica } from "@/lib/folha/conferencia";
import { buscarAnaliseFolha, listarFolhasImportadas, type AnaliseFolha, type FolhaImportada } from "./actions";
import { ImportadorFolha } from "./importador";
import { StatCard } from "./stat-card";

type FiltroStatus = "todos" | Exclude<StatusCritica, "info">;

const ROTULO_STATUS: Record<StatusCritica, string> = {
  erro: "Erro",
  alerta: "Alerta",
  pendente: "Pendente",
  ok: "OK",
  info: "Info",
};
const VARIANTE_STATUS: Record<StatusCritica, "destructive" | "warning" | "default" | "success" | "outline"> = {
  erro: "destructive",
  alerta: "warning",
  pendente: "default",
  ok: "success",
  info: "outline",
};
const ROTULO_CATEGORIA: Record<Categoria, string> = {
  normal: "",
  ferias: "Férias",
  rescisao: "Rescisão",
  afastado: "Afastado",
};

function moeda(valor: number | undefined) {
  if (valor === undefined) return "—";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function chave(f: { empresaId: string; competencia: string }) {
  return `${f.empresaId}|${f.competencia}`;
}

function contar(f: ResultadoFuncionario, status: StatusCritica) {
  return f.criticas.filter((c) => c.status === status).length;
}

export function AnaliseFolhaCentral() {
  const podeOperar = usePodeOperar("folha");
  const [folhas, setFolhas] = useState<FolhaImportada[] | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [analise, setAnalise] = useState<AnaliseFolha | null>(null);
  const [carregando, startCarregando] = useTransition();

  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<"todas" | Categoria>("todas");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [mostrarOk, setMostrarOk] = useState(false);
  const [visao, setVisao] = useState<"geral" | "banco-horas">("geral");

  function carregar(valor: string) {
    setSelecionada(valor);
    setAbertos(new Set());
    const [empresaId, competencia] = valor.split("|");
    startCarregando(async () => {
      const result = await buscarAnaliseFolha(empresaId, competencia);
      setAnalise(result.data);
    });
  }

  function recarregarLista(selecionar?: string) {
    listarFolhasImportadas().then((lista) => {
      setFolhas(lista);
      const alvo = selecionar ?? (lista[0] ? chave(lista[0]) : null);
      if (alvo) carregar(alvo);
    });
  }

  useEffect(() => {
    recarregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lista = useMemo(() => {
    if (!analise) return [];
    const termo = busca.trim().toLowerCase();
    return analise.funcionarios.filter((f) => {
      if (filtroStatus === "ok" && f.status !== "ok") return false;
      if (filtroStatus !== "todos" && filtroStatus !== "ok" && !f.criticas.some((c) => c.status === filtroStatus)) return false;
      if (filtroCategoria !== "todas" && f.categoria !== filtroCategoria) return false;
      if (termo && !f.nome.toLowerCase().includes(termo) && !f.matricula.includes(termo)) return false;
      return true;
    });
  }, [analise, busca, filtroStatus, filtroCategoria]);

  function alternar(matricula: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(matricula)) novo.delete(matricula);
      else novo.add(matricula);
      return novo;
    });
  }

  function exportarCsv() {
    if (!analise) return;
    const linhas: (string | number)[][] = [];
    for (const f of analise.funcionarios) {
      for (const c of f.criticas) {
        if (c.status === "ok" || c.status === "info") continue;
        linhas.push([
          f.matricula,
          f.nome,
          f.funcao,
          ROTULO_CATEGORIA[f.categoria] || "Normal",
          ROTULO_STATUS[c.status],
          c.titulo,
          c.esperado ?? "",
          c.encontrado ?? "",
          c.detalhe,
        ]);
      }
    }
    baixarCsv(
      `criticas-folha-${analise.competencia.replace("/", "-")}`,
      paraCsv(["Matrícula", "Nome", "Função", "Situação", "Status", "Verificação", "Esperado", "Encontrado", "Detalhe"], linhas),
    );
  }

  const opcoes = folhas ?? [];

  return (
    <div className="flex flex-col gap-6">
      {podeOperar && <ImportadorFolha onImportado={(empresaId, competencia) => recarregarLista(`${empresaId}|${competencia}`)} />}

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label>Folha importada</Label>
          <Select value={selecionada ?? ""} onValueChange={(v) => v && carregar(v as string)}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder={folhas === null ? "Carregando..." : "Nenhuma folha importada"}>
                {(valor: string | null) => {
                  const f = opcoes.find((o) => chave(o) === valor);
                  return f ? `${f.competencia} · ${f.empresaNome}` : null;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {opcoes.map((f) => (
                <SelectItem key={chave(f)} value={chave(f)}>
                  {f.competencia} · {f.empresaNome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {analise && (
          <p className="pb-2 font-mono text-[10px] tracking-[.04em] text-text-3">
            arquivo {analise.nomeArquivo} · importado em {new Date(analise.importadaEm).toLocaleString("pt-BR")}
          </p>
        )}
      </div>

      {folhas !== null && opcoes.length === 0 && (
        <p className="font-mono text-[11px] text-text-3">
          Nenhuma folha importada ainda.
          {podeOperar ? " Use o quadro acima para importar o TXT da folha." : ""}
        </p>
      )}

      {carregando && !analise && <p className="font-mono text-[11px] text-text-3">carregando análise...</p>}

      {analise && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <StatCard
              label="Funcionários"
              value={analise.resumo.total}
              cor="neutral"
              ativo={filtroStatus === "todos"}
              onClick={() => setFiltroStatus("todos")}
            />
            <StatCard
              label="Com erro"
              value={analise.resumo.erro}
              cor="red"
              ativo={filtroStatus === "erro"}
              onClick={() => setFiltroStatus("erro")}
            />
            <StatCard
              label="Com alerta"
              value={analise.resumo.alerta}
              cor="yellow"
              ativo={filtroStatus === "alerta"}
              onClick={() => setFiltroStatus("alerta")}
            />
            <StatCard
              label="Pendentes"
              value={analise.resumo.pendente}
              cor="blue"
              ativo={filtroStatus === "pendente"}
              onClick={() => setFiltroStatus("pendente")}
            />
            <StatCard
              label="Tudo certo"
              value={analise.resumo.ok}
              cor="green"
              ativo={filtroStatus === "ok"}
              onClick={() => setFiltroStatus("ok")}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Proventos" value={moeda(analise.totais.proventos)} cor="neutral" />
            <StatCard label="Descontos" value={moeda(analise.totais.descontos)} cor="neutral" />
            <StatCard label="Líquido" value={moeda(analise.totais.liquido)} cor="neutral" />
            <StatCard label="INSS" value={moeda(analise.totais.inss)} cor="neutral" />
            <StatCard label="IR" value={moeda(analise.totais.ir)} cor="neutral" />
            <StatCard label="FGTS" value={moeda(analise.totais.fgts)} cor="neutral" />
            <StatCard label="E-consignado" value={moeda(analise.totais.consignado)} cor="neutral" />
          </div>

          <p className="font-mono text-[10px] tracking-[.04em] text-text-3">
            Tabelas de INSS/IR de {analise.anoParametros}
            {!analise.parametrosExatos && " (tabelas do ano da competência ainda não cadastradas — usando as mais recentes)"} · DSR do mês:{" "}
            {analise.calendario.diasDsr} dia(s) de descanso ÷ {analise.calendario.diasUteis} dias úteis (feriados nacionais)
          </p>
          {!analise.bancoHorasImportado && (
            <p className="font-mono text-[11px] text-warning">
              Banco de horas de {analise.competencia} ainda não importado — a hora extra 50% será conferida com ele assim que for importado.
            </p>
          )}

          <div className="flex gap-2">
            <Button variant={visao === "geral" ? "default" : "secondary"} size="sm" onClick={() => setVisao("geral")}>
              Conferência geral
            </Button>
            <Button variant={visao === "banco-horas" ? "default" : "secondary"} size="sm" onClick={() => setVisao("banco-horas")}>
              Hora extra x Banco de horas
            </Button>
          </div>

          {visao === "banco-horas" ? (
            <ComparativoBancoHoras analise={analise} />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Buscar</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-3" />
                    <Input className="w-64 pl-8" placeholder="Nome ou matrícula" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Situação</Label>
                  <Select value={filtroCategoria} onValueChange={(v) => setFiltroCategoria(v as "todas" | Categoria)}>
                    <SelectTrigger className="w-40">
                      <SelectValue>
                        {(valor: string) => (valor === "todas" ? "Todas" : ROTULO_CATEGORIA[valor as Categoria] || "Normal")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="ferias">Férias</SelectItem>
                      <SelectItem value="rescisao">Rescisão</SelectItem>
                      <SelectItem value="afastado">Afastado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 pb-2 font-mono text-[11px] text-text-2">
                  <input type="checkbox" checked={mostrarOk} onChange={(e) => setMostrarOk(e.target.checked)} />
                  mostrar também as contas que bateram
                </label>
                <div className="ml-auto flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setAbertos(new Set(lista.map((f) => f.matricula)))}>
                    Abrir todos
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setAbertos(new Set())}>
                    Fechar todos
                  </Button>
                  <Button variant="secondary" size="sm" onClick={exportarCsv}>
                    <Download />
                    Exportar críticas
                  </Button>
                </div>
              </div>

              <Table containerClassName="max-h-[70vh] overflow-y-auto">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome / função</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Proventos</TableHead>
                    <TableHead className="text-right">Descontos</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead>Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center font-mono text-[11px] text-text-3">
                        Nenhum funcionário com esse filtro.
                      </TableCell>
                    </TableRow>
                  )}
                  {lista.map((f) => {
                    const aberto = abertos.has(f.matricula);
                    return (
                      <Fragment key={f.matricula}>
                        <TableRow className="cursor-pointer hover:bg-secondary" onClick={() => alternar(f.matricula)}>
                          <TableCell>{aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</TableCell>
                          <TableCell className="font-mono">{f.matricula}</TableCell>
                          <TableCell>
                            <div className="text-foreground">{f.nome}</div>
                            <div className="font-mono text-[10px] text-text-3">{f.funcao}</div>
                          </TableCell>
                          <TableCell>
                            {ROTULO_CATEGORIA[f.categoria] ? <Badge variant="secondary">{ROTULO_CATEGORIA[f.categoria]}</Badge> : null}
                          </TableCell>
                          <TableCell className="text-right font-mono">{moeda(f.proventos)}</TableCell>
                          <TableCell className="text-right font-mono">{moeda(f.descontos)}</TableCell>
                          <TableCell className="text-right font-mono">{moeda(f.liquido)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(["erro", "alerta", "pendente"] as const).map((s) => {
                                const n = contar(f, s);
                                return n > 0 ? (
                                  <Badge key={s} variant={VARIANTE_STATUS[s]}>
                                    {n} {ROTULO_STATUS[s].toLowerCase()}
                                  </Badge>
                                ) : null;
                              })}
                              {f.status === "ok" && <Badge variant="success">OK</Badge>}
                            </div>
                          </TableCell>
                        </TableRow>
                        {aberto && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-bg-2 px-6 py-3 whitespace-normal">
                              <DetalheCriticas criticas={f.criticas} mostrarOk={mostrarOk} situacao={f.situacao} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </>
      )}
    </div>
  );
}

function horas(valor: number | undefined) {
  if (valor === undefined) return "—";
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h`;
}

// Visão lado a lado: horas "A Pagar" do Banco de Horas x hora extra 50% paga na folha, uma linha
// por funcionário conferido (motorista escolar fica de fora — hora extra fixa, sem banco de horas).
function ComparativoBancoHoras({ analise }: { analise: AnaliseFolha }) {
  const [filtro, setFiltro] = useState<"todos" | "ok" | "erro" | "alerta" | "pendente">("todos");
  const [busca, setBusca] = useState("");

  const linhas = useMemo(
    () =>
      analise.funcionarios.flatMap((f) => {
        const c = f.criticas.find((k) => k.regra === "banco_horas");
        if (!c) return [];
        const diferenca = c.esperado !== undefined && c.encontrado !== undefined ? c.encontrado - c.esperado : undefined;
        return [{ f, c, diferenca }];
      }),
    [analise],
  );
  const contagem = (s: StatusCritica) => linhas.filter((l) => l.c.status === s).length;
  const totalBh = linhas.reduce((a, l) => a + (l.c.esperado ?? 0), 0);
  const totalFolha = linhas.reduce((a, l) => a + (l.c.encontrado ?? 0), 0);

  const termo = busca.trim().toLowerCase();
  const visiveis = linhas
    .filter((l) => filtro === "todos" || l.c.status === filtro)
    .filter((l) => !termo || l.f.nome.toLowerCase().includes(termo) || l.f.matricula.includes(termo))
    .sort((a, b) => Math.abs(b.diferenca ?? 0) - Math.abs(a.diferenca ?? 0) || a.f.matricula.localeCompare(b.f.matricula));

  function exportar() {
    baixarCsv(
      `hora-extra-x-banco-horas-${analise.competencia.replace("/", "-")}`,
      paraCsv(
        ["Matrícula", "Nome", "Função", "Situação", "Banco de horas (h)", "Folha (h)", "Diferença (h)", "Status", "Detalhe"],
        visiveis.map((l) => [
          l.f.matricula,
          l.f.nome,
          l.f.funcao,
          ROTULO_CATEGORIA[l.f.categoria] || "Normal",
          l.c.esperado ?? "",
          l.c.encontrado ?? "",
          l.diferenca !== undefined ? Math.round(l.diferenca * 100) / 100 : "",
          ROTULO_STATUS[l.c.status],
          l.c.detalhe,
        ]),
      ),
    );
  }

  if (!analise.bancoHorasImportado) {
    return (
      <p className="font-mono text-[11px] text-warning">
        O banco de horas de {analise.competencia} desta empresa ainda não foi importado. Importe o extrato no Banco de Horas e o comparativo
        aparece aqui automaticamente.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <StatCard label="Comparados" value={linhas.length} cor="neutral" ativo={filtro === "todos"} onClick={() => setFiltro("todos")} />
        <StatCard label="Bateram" value={contagem("ok")} cor="green" ativo={filtro === "ok"} onClick={() => setFiltro("ok")} />
        <StatCard label="Divergentes" value={contagem("erro")} cor="red" ativo={filtro === "erro"} onClick={() => setFiltro("erro")} />
        <StatCard
          label="Alerta (rescisão)"
          value={contagem("alerta")}
          cor="yellow"
          ativo={filtro === "alerta"}
          onClick={() => setFiltro("alerta")}
        />
        <StatCard
          label="Pendentes"
          value={contagem("pendente")}
          cor="blue"
          ativo={filtro === "pendente"}
          onClick={() => setFiltro("pendente")}
        />
      </div>
      <p className="font-mono text-[10px] tracking-[.04em] text-text-3">
        Total de horas: banco de horas {horas(totalBh)} a pagar · folha {horas(totalFolha)} de hora extra 50% · motorista escolar não entra
        (hora extra fixa)
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
          Exportar comparativo
        </Button>
      </div>

      <Table containerClassName="max-h-[70vh] overflow-y-auto">
        <TableHeader className="sticky top-0 z-10">
          <TableRow>
            <TableHead>Matrícula</TableHead>
            <TableHead>Nome / função</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Banco de horas</TableHead>
            <TableHead className="text-right">Folha</TableHead>
            <TableHead className="text-right">Diferença</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead>Observação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiveis.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-6 text-center font-mono text-[11px] text-text-3">
                Nenhum funcionário com esse filtro.
              </TableCell>
            </TableRow>
          )}
          {visiveis.map(({ f, c, diferenca }) => (
            <TableRow key={f.matricula}>
              <TableCell className="font-mono">{f.matricula}</TableCell>
              <TableCell>
                <div className="text-foreground">{f.nome}</div>
                <div className="font-mono text-[10px] text-text-3">{f.funcao}</div>
              </TableCell>
              <TableCell>
                {ROTULO_CATEGORIA[f.categoria] ? <Badge variant="secondary">{ROTULO_CATEGORIA[f.categoria]}</Badge> : null}
              </TableCell>
              <TableCell className="text-right font-mono">{horas(c.esperado)}</TableCell>
              <TableCell className="text-right font-mono">{horas(c.encontrado)}</TableCell>
              <TableCell className={`text-right font-mono ${diferenca !== undefined && Math.abs(diferenca) > 0.011 ? "text-danger" : ""}`}>
                {diferenca === undefined ? "—" : horas(Math.round(diferenca * 100) / 100)}
              </TableCell>
              <TableCell>
                <Badge variant={VARIANTE_STATUS[c.status]}>{c.status === "ok" ? "Bateu" : ROTULO_STATUS[c.status]}</Badge>
              </TableCell>
              <TableCell className="max-w-md text-[11px] whitespace-normal text-text-2">{c.status === "ok" ? "" : c.detalhe}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DetalheCriticas({ criticas, mostrarOk, situacao }: { criticas: Critica[]; mostrarOk: boolean; situacao: string }) {
  const ordem: Record<StatusCritica, number> = {
    erro: 0,
    alerta: 1,
    pendente: 2,
    info: 3,
    ok: 4,
  };
  const visiveis = criticas.filter((c) => mostrarOk || c.status !== "ok").sort((a, b) => ordem[a.status] - ordem[b.status]);
  const totalOk = criticas.filter((c) => c.status === "ok").length;

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] text-text-3">
        Situação no ERP: {situacao} · {totalOk} conta(s) conferida(s) e corretas
        {!mostrarOk && totalOk > 0 ? " (marque “mostrar também as contas que bateram” para ver)" : ""}
      </p>
      {visiveis.length === 0 ? (
        <p className="font-mono text-[11px] text-success">Todas as contas conferidas bateram.</p>
      ) : (
        <table className="w-full table-fixed text-[11px]">
          <thead>
            <tr className="text-left font-mono text-[10px] tracking-[.04em] text-text-3 uppercase">
              <th className="w-20 py-1 font-medium">Status</th>
              <th className="w-56 py-1 font-medium">Verificação</th>
              <th className="w-28 py-1 text-right font-medium">Esperado</th>
              <th className="w-28 py-1 text-right font-medium">No ERP</th>
              <th className="py-1 pl-4 font-medium">Como foi calculado</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c, i) => (
              <tr key={i} className="border-t border-border align-top">
                <td className="py-1.5">
                  <Badge variant={VARIANTE_STATUS[c.status]}>{ROTULO_STATUS[c.status]}</Badge>
                </td>
                <td className="py-1.5 text-foreground">{c.titulo}</td>
                <td className="py-1.5 text-right font-mono">{moeda(c.esperado)}</td>
                <td className={`py-1.5 text-right font-mono ${c.status === "erro" || c.status === "alerta" ? "text-danger" : ""}`}>
                  {moeda(c.encontrado)}
                </td>
                <td className="py-1.5 pl-4 whitespace-normal text-text-2">{c.detalhe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
