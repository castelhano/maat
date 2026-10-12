"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ChevronRight, Download, Printer, Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { paraCsv, baixarCsv } from "@/lib/csv";
import { lerArquivoTexto } from "@/app/admin/importar/ler-arquivo";
import { StatCard } from "@/app/admin/folha/stat-card";
import { parseFrequencia, type DiaFrequencia } from "@/lib/parsers/frequencia";
import {
  analisarFrequencia,
  formatarDuracao,
  formatarHorario,
  rotuloOcorrencia,
  TIPOS_ALERTA,
  type ColaboradorAnalisado,
  type DiaAnalisado,
  type TipoAlerta,
  type TrechoPosicionado,
} from "@/lib/frequencia/analise";
import { buscarNomesFrequencia } from "./actions";

type Colaborador = ColaboradorAnalisado & { nome: string };

type Analise = {
  nomeArquivo: string;
  empresa: string;
  periodo: { inicio: string; fim: string };
  colaboradores: Colaborador[];
  totais: Record<TipoAlerta, number>;
};

// Arquivo já lido, guardado para refazer a análise quando muda a regra do fracionamento.
type Lido = {
  nomeArquivo: string;
  empresa: string;
  periodo: { inicio: string; fim: string };
  dias: DiaFrequencia[];
  nomes: Record<string, string>;
};

function montarAnalise(lido: Lido, fracionarInterjornada: boolean): Analise {
  const colaboradores = analisarFrequencia(lido.dias, { fracionarInterjornada });
  const totais = Object.fromEntries(TIPOS_ALERTA.map((t) => [t, 0])) as Record<TipoAlerta, number>;
  for (const c of colaboradores) for (const t of TIPOS_ALERTA) totais[t] += c.contagem[t];
  return {
    nomeArquivo: lido.nomeArquivo,
    empresa: lido.empresa,
    periodo: lido.periodo,
    colaboradores: colaboradores.map((c) => ({ ...c, nome: lido.nomes[c.matricula] ?? "(não encontrado no cadastro)" })),
    totais,
  };
}

type Visao = "colaboradores" | "alertas" | "he";
type FiltroTipo = "todos" | TipoAlerta;

const ROTULO_ALERTA: Record<TipoAlerta, string> = {
  jornada_curta: "Jornada curta",
  excesso: "Acima de 11h",
  interjornada: "Interjornada",
  he: "HE",
  troca: "Troca de escala",
  ocorrencia: "Ocorrência",
};
const VARIANTE_ALERTA: Record<TipoAlerta, "destructive" | "warning" | "default" | "outline"> = {
  jornada_curta: "destructive",
  excesso: "destructive",
  interjornada: "destructive",
  he: "warning",
  troca: "default",
  ocorrencia: "outline",
};

const COR_CARD: Record<TipoAlerta, "red" | "yellow" | "blue" | "neutral"> = {
  jornada_curta: "red",
  excesso: "red",
  interjornada: "red",
  he: "yellow",
  troca: "blue",
  ocorrencia: "neutral",
};

// Alertas que pedem ação; ocorrência (atestado, falta justificada) é só informativa.
const TIPOS_ACAO = TIPOS_ALERTA.filter((t) => t !== "ocorrencia");

function totalAlertas(c: ColaboradorAnalisado) {
  return TIPOS_ACAO.reduce((acc, t) => acc + c.contagem[t], 0);
}

function nomeCompetencia(periodo: { inicio: string; fim: string }) {
  return periodo.inicio === periodo.fim ? periodo.inicio : `${periodo.inicio} a ${periodo.fim}`;
}

function textoTrecho(t: TrechoPosicionado) {
  const servico = t.servico ? ` ${t.servico}` : "";
  const noite = t.inicio < 0 ? " (noite anterior)" : "";
  return `${t.linha || "—"}${servico} · ${formatarHorario(t.inicio)}–${formatarHorario(t.fim)}${noite}`;
}

function Trechos({ trechos, ocorrencia, vazio }: { trechos: TrechoPosicionado[]; ocorrencia?: string | null; vazio: string }) {
  if (ocorrencia) return <span className="text-text-2">{ocorrencia}</span>;
  if (trechos.length === 0) return <span className="text-text-3">{vazio}</span>;
  return (
    <div className="flex flex-col gap-0.5 font-mono">
      {trechos.map((t, i) => (
        <span key={i}>{textoTrecho(t)}</span>
      ))}
    </div>
  );
}

export function AnaliseFrequenciaCentral() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lido, setLido] = useState<Lido | null>(null);
  const [fracionar, setFracionar] = useState(true);
  const analise = useMemo(() => (lido ? montarAnalise(lido, fracionar) : null), [lido, fracionar]);
  const [carregando, startCarregando] = useTransition();

  const [visao, setVisao] = useState<Visao>("colaboradores");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [mostrarSemAlerta, setMostrarSemAlerta] = useState(false);

  function limpar() {
    setLido(null);
    setAbertos(new Set());
    setFiltroTipo("todos");
    setBusca("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFile(file: File) {
    startCarregando(async () => {
      let arquivo: ReturnType<typeof parseFrequencia>;
      try {
        arquivo = parseFrequencia(await lerArquivoTexto(file));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao ler o arquivo.");
        limpar();
        return;
      }
      const { empresaNome, nomes } = await buscarNomesFrequencia(arquivo.empresa.codigo, [
        ...new Set(arquivo.dias.map((d) => d.matricula)),
      ]);
      setAbertos(new Set());
      setFiltroTipo("todos");
      setLido({
        nomeArquivo: file.name,
        empresa: empresaNome ?? arquivo.empresa.nome,
        periodo: arquivo.periodo,
        dias: arquivo.dias,
        nomes,
      });
    });
  }

  const termo = busca.trim().toLowerCase();
  const passaBusca = (c: Colaborador) => !termo || c.nome.toLowerCase().includes(termo) || c.matricula.includes(termo);

  const colaboradores = useMemo(() => {
    if (!analise) return [];
    return analise.colaboradores
      .filter((c) => (filtroTipo === "todos" ? true : c.contagem[filtroTipo] > 0))
      .filter(passaBusca)
      .sort((a, b) => totalAlertas(b) - totalAlertas(a) || a.matricula.localeCompare(b.matricula));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise, filtroTipo, termo]);

  function alternar(chave: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  function exportarColaboradores() {
    if (!analise) return;
    baixarCsv(
      `frequencia-colaboradores-${analise.periodo.inicio.replace(/\//g, "-")}`,
      paraCsv(
        ["Código", "Nome", "Função", "Dias trabalhados", "Horas realizadas", ...TIPOS_ALERTA.map((t) => ROTULO_ALERTA[t])],
        colaboradores.map((c) => [
          c.matricula,
          c.nome,
          c.funcao,
          c.diasTrabalhados,
          formatarDuracao(c.minutosRealizados),
          ...TIPOS_ALERTA.map((t) => c.contagem[t]),
        ])
      )
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-[4px] border border-primary/30 bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.1em] text-primary">
            IMPORTAR
          </span>
          <span className="font-mono text-[11px] font-medium tracking-[.08em] text-text-2 uppercase">
            Realizado x Programado do ERP (FRQ, .TXT)
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${
            analise ? "border-success bg-success-dim" : "border-border-hi bg-white/[.04] hover:border-primary hover:bg-accent-glow"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.TXT"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {analise ? <CheckCircle2 className="size-[22px] text-success" /> : <Upload className="size-[22px] text-text-3" />}
          <strong className="text-xs font-medium text-foreground">
            {analise ? "Clique para analisar outro arquivo" : "Clique para selecionar o relatório Realizado x Programado (.TXT)"}
          </strong>
          {analise && <span className="font-mono text-[10px] text-success">{analise.nomeArquivo}</span>}
        </label>
        <p className="font-mono text-[10px] tracking-[.04em] text-text-3">
          A análise é feita na hora e não fica gravada — exporte as planilhas antes de sair da página.
        </p>
        {carregando && <p className="font-mono text-[11px] text-text-3">analisando o arquivo...</p>}
      </div>

      {analise && (
        <>
          <p className="font-mono text-[11px] text-text-2">
            {analise.empresa} · período <span className="text-foreground">{nomeCompetencia(analise.periodo)}</span> ·{" "}
            {analise.colaboradores.length} colaborador(es)
          </p>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard
              label="Colaboradores"
              value={analise.colaboradores.length}
              cor="neutral"
              ativo={filtroTipo === "todos"}
              onClick={() => setFiltroTipo("todos")}
            />
            {TIPOS_ALERTA.map((t) => (
              <StatCard
                key={t}
                label={ROTULO_ALERTA[t]}
                value={analise.totais[t]}
                cor={COR_CARD[t]}
                ativo={filtroTipo === t}
                onClick={() => setFiltroTipo(t)}
              />
            ))}
          </div>
          <p className="font-mono text-[10px] tracking-[.04em] text-text-3">
            Cartões contam ocorrências (dias). Jornada curta: abaixo de 4:00 no dia · Acima de 11h: somando os trechos do dia · HE: 30 min
            ou mais antes da entrada ou depois da saída, no mesmo turno · Troca: outro turno ou outra linha com 1h ou mais de diferença,
            entrada 1h depois ou dia sem escala · Interjornada: menos de 11h de descanso entre um dia e outro{" "}
            {fracionar ? "(com fracionamento: mínimo 8h seguidas, completando as 11h com as pausas do dia seguinte em até 16h)" : "(11h seguidas)"} · Turnos: madrugada 22:00–03:59,
            manhã 04:00–11:59, tarde 12:00–21:59.
          </p>

          <label className="flex items-start gap-2 font-mono text-[11px] text-text-2">
            <input type="checkbox" className="mt-0.5" checked={fracionar} onChange={(e) => setFracionar(e.target.checked)} />
            <span>
              aplicar fracionamento da interjornada (art. 235-C, §3º, CLT — Lei 13.103/2015): aceita 8h seguidas + pausas da dupla pegada
              até completar 11h.{" "}
              <span className="text-warning">
                O STF declarou esse fracionamento inconstitucional (ADI 5322, a partir de 12/07/2023) — confirme com o jurídico.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant={visao === "colaboradores" ? "default" : "secondary"} size="sm" onClick={() => setVisao("colaboradores")}>
              Por colaborador
            </Button>
            <Button variant={visao === "alertas" ? "default" : "secondary"} size="sm" onClick={() => setVisao("alertas")}>
              Todos os alertas
            </Button>
            <Button variant={visao === "he" ? "default" : "secondary"} size="sm" onClick={() => setVisao("he")}>
              Relatório de HE
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-3" />
                <Input className="w-64 pl-8" placeholder="Nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>
            {visao === "colaboradores" && (
              <>
                <label className="flex items-center gap-2 pb-2 font-mono text-[11px] text-text-2">
                  <input type="checkbox" checked={mostrarSemAlerta} onChange={(e) => setMostrarSemAlerta(e.target.checked)} />
                  mostrar também os dias sem alerta
                </label>
                <div className="ml-auto flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setAbertos(new Set(colaboradores.map((c) => c.matricula)))}>
                    Abrir todos
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setAbertos(new Set())}>
                    Fechar todos
                  </Button>
                  <Button variant="secondary" size="sm" onClick={exportarColaboradores}>
                    <Download />
                    Exportar
                  </Button>
                </div>
              </>
            )}
          </div>

          {visao === "colaboradores" && (
            <PorColaborador
              colaboradores={colaboradores}
              abertos={abertos}
              alternar={alternar}
              mostrarSemAlerta={mostrarSemAlerta}
            />
          )}
          {visao === "alertas" && <TodosAlertas analise={analise} filtroTipo={filtroTipo} passaBusca={passaBusca} />}
          {visao === "he" && <RelatorioHe analise={analise} passaBusca={passaBusca} />}
        </>
      )}
    </div>
  );
}

function PorColaborador({
  colaboradores,
  abertos,
  alternar,
  mostrarSemAlerta,
}: {
  colaboradores: Colaborador[];
  abertos: Set<string>;
  alternar: (chave: string) => void;
  mostrarSemAlerta: boolean;
}) {
  return (
    <Table containerClassName="max-h-[70vh] overflow-y-auto">
      <TableHeader className="sticky top-0 z-10">
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Código</TableHead>
          <TableHead>Nome / função</TableHead>
          <TableHead className="text-right">Dias</TableHead>
          <TableHead className="text-right">Horas</TableHead>
          <TableHead>Alertas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {colaboradores.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="py-6 text-center font-mono text-[11px] text-text-3">
              Nenhum colaborador com esse filtro.
            </TableCell>
          </TableRow>
        )}
        {colaboradores.map((c) => {
          const aberto = abertos.has(c.matricula);
          return (
            <Fragment key={c.matricula}>
              <TableRow className="cursor-pointer hover:bg-secondary" onClick={() => alternar(c.matricula)}>
                <TableCell>{aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</TableCell>
                <TableCell className="font-mono">{c.matricula}</TableCell>
                <TableCell>
                  <div className="text-foreground">{c.nome}</div>
                  <div className="font-mono text-[10px] text-text-3">{c.funcao}</div>
                </TableCell>
                <TableCell className="text-right font-mono">{c.diasTrabalhados}</TableCell>
                <TableCell className="text-right font-mono">{formatarDuracao(c.minutosRealizados)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {TIPOS_ALERTA.map((t) =>
                      c.contagem[t] > 0 ? (
                        <Badge key={t} variant={VARIANTE_ALERTA[t]}>
                          {c.contagem[t]} {ROTULO_ALERTA[t].toLowerCase()}
                        </Badge>
                      ) : null
                    )}
                    {totalAlertas(c) === 0 && c.contagem.ocorrencia === 0 && <Badge variant="success">OK</Badge>}
                  </div>
                </TableCell>
              </TableRow>
              {aberto && (
                <TableRow>
                  <TableCell colSpan={6} className="bg-bg-2 px-6 py-3 whitespace-normal">
                    <DetalheDias dias={c.dias.filter((d) => mostrarSemAlerta || d.alertas.length > 0)} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DetalheDias({ dias }: { dias: DiaAnalisado[] }) {
  if (dias.length === 0) {
    return (
      <p className="font-mono text-[11px] text-success">
        Nenhum dia com alerta (marque “mostrar também os dias sem alerta” para ver todos).
      </p>
    );
  }
  return (
    <table className="w-full table-fixed text-[11px]">
      <thead>
        <tr className="text-left font-mono text-[10px] tracking-[.04em] text-text-3 uppercase">
          <th className="w-24 py-1 font-medium">Data</th>
          <th className="w-64 py-1 font-medium">Programado</th>
          <th className="w-64 py-1 font-medium">Realizado</th>
          <th className="w-16 py-1 text-right font-medium">Prog.</th>
          <th className="w-16 py-1 text-right font-medium">Real.</th>
          <th className="py-1 pl-4 font-medium">Alertas</th>
        </tr>
      </thead>
      <tbody>
        {dias.map((d) => (
          <tr key={d.data} className="border-t border-border align-top">
            <td className="py-1.5 font-mono">{d.data}</td>
            <td className="py-1.5">
              <Trechos trechos={d.programado} vazio="sem escala" />
            </td>
            <td className="py-1.5">
              <Trechos trechos={d.realizado} ocorrencia={d.ocorrencia && rotuloOcorrencia(d.ocorrencia)} vazio="sem marcação" />
            </td>
            <td className="py-1.5 text-right font-mono">{d.minutosProgramados ? formatarDuracao(d.minutosProgramados) : "—"}</td>
            <td className="py-1.5 text-right font-mono">{d.minutosRealizados ? formatarDuracao(d.minutosRealizados) : "—"}</td>
            <td className="py-1.5 pl-4">
              {d.alertas.length === 0 ? (
                <span className="text-text-3">—</span>
              ) : (
                <div className="flex flex-col gap-1">
                  {d.alertas.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Badge variant={VARIANTE_ALERTA[a.tipo]}>{ROTULO_ALERTA[a.tipo]}</Badge>
                      {a.tipo !== "ocorrencia" && <span className="whitespace-normal text-text-2">{a.detalhe}</span>}
                    </div>
                  ))}
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function dataOrdenavel(data: string) {
  return data.split("/").reverse().join("");
}

function TodosAlertas({
  analise,
  filtroTipo,
  passaBusca,
}: {
  analise: Analise;
  filtroTipo: FiltroTipo;
  passaBusca: (c: Colaborador) => boolean;
}) {
  const linhas = analise.colaboradores
    .filter(passaBusca)
    .flatMap((c) =>
      c.dias.flatMap((d) =>
        d.alertas
          .filter((a) => (filtroTipo === "todos" ? a.tipo !== "ocorrencia" : a.tipo === filtroTipo))
          .map((a) => ({ c, d, a }))
      )
    )
    .sort(
      (x, y) =>
        dataOrdenavel(x.d.data).localeCompare(dataOrdenavel(y.d.data)) ||
        TIPOS_ALERTA.indexOf(x.a.tipo) - TIPOS_ALERTA.indexOf(y.a.tipo) ||
        x.c.matricula.localeCompare(y.c.matricula)
    );

  function exportar() {
    baixarCsv(
      `frequencia-alertas-${analise.periodo.inicio.replace(/\//g, "-")}`,
      paraCsv(
        ["Data", "Código", "Nome", "Função", "Alerta", "Programado", "Realizado", "Horas programadas", "Horas realizadas", "Detalhe"],
        linhas.map(({ c, d, a }) => [
          d.data,
          c.matricula,
          c.nome,
          c.funcao,
          ROTULO_ALERTA[a.tipo],
          d.programado.map(textoTrecho).join(" / "),
          d.ocorrencia ? rotuloOcorrencia(d.ocorrencia) : d.realizado.map(textoTrecho).join(" / "),
          formatarDuracao(d.minutosProgramados),
          formatarDuracao(d.minutosRealizados),
          a.detalhe,
        ])
      )
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="font-mono text-[11px] text-text-2">
          {linhas.length} alerta(s){filtroTipo === "todos" ? " (sem as ocorrências justificadas)" : ` de ${ROTULO_ALERTA[filtroTipo].toLowerCase()}`}
        </p>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={exportar}>
          <Download />
          Exportar alertas
        </Button>
      </div>
      <Table containerClassName="max-h-[70vh] overflow-y-auto">
        <TableHeader className="sticky top-0 z-10">
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Alerta</TableHead>
            <TableHead>Detalhe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center font-mono text-[11px] text-text-3">
                Nenhum alerta com esse filtro.
              </TableCell>
            </TableRow>
          )}
          {linhas.map(({ c, d, a }, i) => (
            <TableRow key={i}>
              <TableCell className="font-mono">{d.data}</TableCell>
              <TableCell className="font-mono">{c.matricula}</TableCell>
              <TableCell>{c.nome}</TableCell>
              <TableCell>
                <Badge variant={VARIANTE_ALERTA[a.tipo]}>{ROTULO_ALERTA[a.tipo]}</Badge>
              </TableCell>
              <TableCell className="max-w-xl text-[11px] whitespace-normal text-text-2">{a.detalhe}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function escaparHtml(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function RelatorioHe({ analise, passaBusca }: { analise: Analise; passaBusca: (c: Colaborador) => boolean }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const linhas = analise.colaboradores
    .filter((c) => c.contagem.he > 0)
    .filter(passaBusca)
    .map((c) => {
      const diasHe = c.dias.filter((d) => d.heEntrada > 0 || d.heSaida > 0);
      const maior = diasHe.reduce((m, d) => (d.heEntrada + d.heSaida > m.heEntrada + m.heSaida ? d : m), diasHe[0]);
      return { c, diasHe, maior, total: c.heEntrada + c.heSaida };
    })
    .sort((a, b) => b.total - a.total || a.c.matricula.localeCompare(b.c.matricula));

  const totalGeral = linhas.reduce((acc, l) => acc + l.total, 0);

  function exportar() {
    const csv: (string | number)[][] = [];
    for (const { c, diasHe } of linhas) {
      for (const d of diasHe) {
        csv.push([
          c.matricula,
          c.nome,
          d.data,
          d.programado.map(textoTrecho).join(" / "),
          d.realizado.map(textoTrecho).join(" / "),
          d.heEntrada ? formatarDuracao(d.heEntrada) : "",
          d.heSaida ? formatarDuracao(d.heSaida) : "",
          formatarDuracao(d.heEntrada + d.heSaida),
        ]);
      }
    }
    baixarCsv(
      `relatorio-he-${analise.periodo.inicio.replace(/\//g, "-")}`,
      paraCsv(["Código", "Nome", "Data", "Programado", "Realizado", "Entrada antecipada", "Saída prorrogada", "Total"], csv)
    );
  }

  function imprimir() {
    const corpo = linhas
      .map(
        ({ c, diasHe, total }) => `
        <tr class="colab"><td>${c.matricula}</td><td colspan="4">${escaparHtml(c.nome)} — ${diasHe.length} dia(s)</td><td>${formatarDuracao(
          total
        )}</td></tr>
        ${diasHe
          .map(
            (d) => `<tr><td></td><td>${d.data}</td><td>${escaparHtml(d.programado.map(textoTrecho).join(" / "))}</td><td>${escaparHtml(
              d.realizado.map(textoTrecho).join(" / ")
            )}</td><td>${d.heEntrada ? `entrada ${formatarDuracao(d.heEntrada)}` : ""}${d.heEntrada && d.heSaida ? " · " : ""}${
              d.heSaida ? `saída ${formatarDuracao(d.heSaida)}` : ""
            }</td><td>${formatarDuracao(d.heEntrada + d.heSaida)}</td></tr>`
          )
          .join("")}`
      )
      .join("");
    const janela = window.open("", "_blank");
    if (!janela) {
      toast.error("O navegador bloqueou a janela de impressão — libere pop-ups para este site.");
      return;
    }
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de HE — ${escaparHtml(
      analise.empresa
    )}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 24px; }
        h1 { font-size: 16px; margin: 0 0 4px; } p { margin: 0 0 12px; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
        th { background: #f2f2f2; } tr.colab td { font-weight: bold; background: #fafafa; border-top: 2px solid #999; }
      </style></head><body>
      <h1>Relatório de entradas antecipadas / saídas prorrogadas (HE)</h1>
      <p>${escaparHtml(analise.empresa)} · período ${nomeCompetencia(analise.periodo)} · ${linhas.length} colaborador(es) · total ${formatarDuracao(
        totalGeral
      )} · marcação 30 min ou mais antes da entrada ou depois da saída programada, no mesmo turno</p>
      <table><thead><tr><th>Código</th><th>Data</th><th>Programado</th><th>Realizado</th><th>Diferença</th><th>Total</th></tr></thead>
      <tbody>${corpo}</tbody></table></body></html>`);
    janela.document.close();
    janela.focus();
    janela.print();
  }

  function alternar(matricula: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(matricula)) novo.delete(matricula);
      else novo.add(matricula);
      return novo;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="font-mono text-[11px] text-text-2">
          {linhas.length} colaborador(es) com marcação de HE · total {formatarDuracao(totalGeral)} além da escala
        </p>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportar}>
            <Download />
            Exportar
          </Button>
          <Button variant="secondary" size="sm" onClick={imprimir}>
            <Printer />
            Imprimir / PDF
          </Button>
        </div>
      </div>
      <Table containerClassName="max-h-[70vh] overflow-y-auto">
        <TableHeader className="sticky top-0 z-10">
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Código</TableHead>
            <TableHead>Nome / função</TableHead>
            <TableHead className="text-right">Dias</TableHead>
            <TableHead className="text-right">Entrada antecipada</TableHead>
            <TableHead className="text-right">Saída prorrogada</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Maior</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-6 text-center font-mono text-[11px] text-text-3">
                Nenhuma marcação de HE encontrada.
              </TableCell>
            </TableRow>
          )}
          {linhas.map(({ c, diasHe, maior, total }) => {
            const aberto = abertos.has(c.matricula);
            return (
              <Fragment key={c.matricula}>
                <TableRow className="cursor-pointer hover:bg-secondary" onClick={() => alternar(c.matricula)}>
                  <TableCell>{aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</TableCell>
                  <TableCell className="font-mono">{c.matricula}</TableCell>
                  <TableCell>
                    <div className="text-foreground">{c.nome}</div>
                    <div className="font-mono text-[10px] text-text-3">{c.funcao}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{diasHe.length}</TableCell>
                  <TableCell className="text-right font-mono">{c.heEntrada ? formatarDuracao(c.heEntrada) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{c.heSaida ? formatarDuracao(c.heSaida) : "—"}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatarDuracao(total)}</TableCell>
                  <TableCell className="font-mono text-[11px]">
                    {formatarDuracao(maior.heEntrada + maior.heSaida)} em {maior.data.slice(0, 5)}
                  </TableCell>
                </TableRow>
                {aberto && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-bg-2 px-6 py-3 whitespace-normal">
                      <DetalheDias dias={diasHe.map((d) => ({ ...d, alertas: d.alertas.filter((a) => a.tipo === "he") }))} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
