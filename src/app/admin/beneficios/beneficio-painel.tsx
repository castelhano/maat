"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { ExportCard } from "./export-card";
import type { ApuracaoItemDTO } from "./actions";

// Par validado (contraste + separação CVD) contra o fundo escuro dos cards deste app.
const COR_ELEGIVEL = "#0d9488";
const COR_NAO_ELEGIVEL = "#ef4444";
const COR_MAGNITUDE = "#3b82f6";

const TOOLTIP_STYLE = {
  background: "#131619",
  border: "1px solid #2a3038",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "#e2e8f0",
};

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function truncar(texto: string, max: number) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

function formatarData(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

function Legenda({ itens }: { itens: { cor: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 pb-2">
      {itens.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: i.cor }} />
          <span className="font-mono text-[10px] tracking-[.04em] text-text-2">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, cor }: { label: string; value: string; cor?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border bg-secondary px-4 py-3">
      <span className="font-mono text-[10px] tracking-[.06em] text-text-3 uppercase">{label}</span>
      <span className="font-mono text-[20px] leading-none font-bold" style={cor ? { color: cor } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function BeneficioPainel({
  itens,
  dimensao,
  competencia,
  filtroEmpresa,
  filtroArea,
}: {
  itens: ApuracaoItemDTO[];
  dimensao: "cesta" | "vr";
  competencia: string;
  filtroEmpresa?: string;
  filtroArea?: string;
}) {
  const [buscaNome, setBuscaNome] = useState("");
  const [buscaMatricula, setBuscaMatricula] = useState("");

  const elegivel = (i: ApuracaoItemDTO) =>
    dimensao === "cesta" ? i.elegivelCestaBasica : i.elegivelVR && i.valorVR > 0;
  const motivo = (i: ApuracaoItemDTO) =>
    dimensao === "cesta"
      ? i.motivoPerdaCesta
      : i.motivoPerdaVR ?? (i.elegivelVR && i.valorVR <= 0 ? "Valor zerado no período" : null);

  const dados = useMemo(() => {
    const elegiveis = itens.filter(elegivel);
    const naoElegiveis = itens.filter((i) => !elegivel(i));
    const terceiros = itens.filter((i) => i.tipo === "terceiro");
    const valorTotal = elegiveis.reduce((acc, i) => acc + i.valorVR, 0);
    const valorConvertidoTotal = itens.reduce((acc, i) => acc + (i.valorCestaConvertida ?? 0), 0);

    const motivosMap = new Map<string, number>();
    for (const i of naoElegiveis) {
      const m = motivo(i);
      if (!m) continue;
      motivosMap.set(m, (motivosMap.get(m) ?? 0) + 1);
    }
    const motivos = [...motivosMap.entries()]
      .map(([label, quantidade]) => ({ label: truncar(label, 42), labelCompleto: label, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const empresaMap = new Map<string, { elegiveis: number; naoElegiveis: number }>();
    for (const i of itens) {
      const atual = empresaMap.get(i.empresaAbbr) ?? { elegiveis: 0, naoElegiveis: 0 };
      if (elegivel(i)) atual.elegiveis++;
      else atual.naoElegiveis++;
      empresaMap.set(i.empresaAbbr, atual);
    }
    const porEmpresa = [...empresaMap.entries()]
      .map(([empresa, v]) => ({ empresa, ...v, total: v.elegiveis + v.naoElegiveis }))
      .sort((a, b) => b.total - a.total);

    const areaMap = new Map<string, { elegiveis: number; naoElegiveis: number; valor: number }>();
    for (const i of itens) {
      const area = i.area ?? (i.tipo === "terceiro" ? "Terceiros" : "Sem área");
      const atual = areaMap.get(area) ?? { elegiveis: 0, naoElegiveis: 0, valor: 0 };
      if (elegivel(i)) {
        atual.elegiveis++;
        atual.valor += i.valorVR;
      } else atual.naoElegiveis++;
      areaMap.set(area, atual);
    }
    let porArea = [...areaMap.entries()]
      .map(([area, v]) => ({ area: truncar(area, 22), areaCompleta: area, ...v }))
      .sort((a, b) => b.naoElegiveis - a.naoElegiveis || b.elegiveis - a.elegiveis);
    if (porArea.length > 10) {
      const resto = porArea.slice(10).reduce(
        (acc, c) => ({
          elegiveis: acc.elegiveis + c.elegiveis,
          naoElegiveis: acc.naoElegiveis + c.naoElegiveis,
          valor: acc.valor + c.valor,
        }),
        { elegiveis: 0, naoElegiveis: 0, valor: 0 }
      );
      porArea = [...porArea.slice(0, 10), { area: "Outras áreas", areaCompleta: "Outras áreas", ...resto }];
    }

    return { elegiveis, naoElegiveis, terceiros, valorTotal, valorConvertidoTotal, motivos, porEmpresa, porArea };
  }, [itens, dimensao]);

  const itensDetalhamento = useMemo(() => {
    const nome = buscaNome.trim().toLowerCase();
    const matricula = buscaMatricula.trim().toLowerCase();
    if (!nome && !matricula) return itens;
    return itens.filter((i) => {
      if (nome && !i.nome.toLowerCase().includes(nome)) return false;
      if (matricula && !(i.matricula ?? "").toLowerCase().includes(matricula)) return false;
      return true;
    });
  }, [itens, buscaNome, buscaMatricula]);

  const csvHeaders = ["Matrícula", "Nome", "Empresa", "Cargo", "Admissão", "Situação", "Motivo", "Valor VR"];
  const csvLinhas = itensDetalhamento.map((i) => [
    i.matricula ?? "",
    i.nome,
    i.empresaNome,
    i.cargo ?? "",
    formatarData(i.dataAdmissao),
    elegivel(i) ? "Com direito" : "Sem direito",
    motivo(i) ?? "",
    i.valorVR.toFixed(2),
  ]);

  const rotuloBeneficio = dimensao === "cesta" ? "cesta básica" : "vale-alimentação";
  const arquivoBase = `${dimensao === "cesta" ? "cesta-basica" : "vale-alimentacao"}-${competencia.replace("/", "-")}`;

  const pdfParams = new URLSearchParams({ competencia, dimensao });
  if (filtroEmpresa) pdfParams.set("empresa", filtroEmpresa);
  if (filtroArea) pdfParams.set("area", filtroArea);
  const pdfHref = `/admin/beneficios/detalhamento-pdf?${pdfParams.toString()}`;
  const relatorioPdfHref = `/admin/beneficios/relatorio-pdf?${pdfParams.toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => window.open(relatorioPdfHref, "_blank")}>
          <FileText />
          Emitir relatório completo (PDF)
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {dimensao === "vr" ? (
          <>
            <StatTile label="Total avaliado" value={String(itens.length)} />
            <StatTile label="Com direito" value={String(dados.elegiveis.length)} cor={COR_ELEGIVEL} />
            <StatTile label="Sem direito" value={String(dados.naoElegiveis.length)} cor={COR_NAO_ELEGIVEL} />
            <StatTile label="Valor total" value={formatarMoeda(dados.valorTotal)} cor={COR_MAGNITUDE} />
          </>
        ) : (
          <>
            <StatTile label="Total avaliado" value={String(itens.length)} />
            <StatTile label="Sem direito" value={String(dados.naoElegiveis.length)} cor={COR_NAO_ELEGIVEL} />
            <StatTile label="Terceiros incluídos" value={String(dados.terceiros.length)} />
            <StatTile label="Com direito" value={String(dados.elegiveis.length)} cor={COR_ELEGIVEL} />
          </>
        )}
      </div>

      {dados.porEmpresa.length > 1 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 px-1">
          {dados.porEmpresa.map((e) => (
            <div key={e.empresa} className="flex items-baseline gap-1.5 font-mono text-[10px]">
              <span className="text-text-2">{e.empresa}</span>
              <span className="font-bold text-foreground">{e.total}</span>
            </div>
          ))}
        </div>
      )}

      {dimensao === "cesta" && dados.valorConvertidoTotal > 0 && (
        <p className="font-mono text-[10px] text-text-3">
          {formatarMoeda(dados.valorConvertidoTotal)} em cesta convertida em crédito de alimentação (colaboradores que
          optaram por não receber a cesta física) — já somado ao valor total na aba de vale-alimentação.
        </p>
      )}

      <ExportCard
        titulo={`Motivos de perda — ${rotuloBeneficio}`}
        descricao={`quem não tem direito nesta competência, por motivo`}
        arquivo={`${arquivoBase}-motivos`}
      >
        {dados.motivos.length === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] text-text-3">
            Ninguém perdeu o benefício nesta competência.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, dados.motivos.length * 36)}>
            <BarChart data={dados.motivos} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" />
              <YAxis
                type="category"
                dataKey="label"
                width={200}
                tick={{ fontSize: 10, fill: "#8fa0b0" }}
                stroke="#2a3038"
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [`${value} colaborador(es)`, ""]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.labelCompleto ?? ""}
              />
              <Bar dataKey="quantidade" fill={COR_NAO_ELEGIVEL} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList dataKey="quantidade" position="right" fill="#8fa0b0" fontSize={10} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ExportCard>

      <ExportCard
        titulo={`Resumo por empresa — ${rotuloBeneficio}`}
        arquivo={`${arquivoBase}-por-empresa`}
      >
        <Legenda itens={[{ cor: COR_ELEGIVEL, label: "Com direito" }, { cor: COR_NAO_ELEGIVEL, label: "Sem direito" }]} />
        <ResponsiveContainer width="100%" height={Math.max(120, dados.porEmpresa.length * 40)}>
          <BarChart data={dados.porEmpresa} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" />
            <YAxis type="category" dataKey="empresa" width={140} tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="elegiveis" name="Com direito" stackId="a" fill={COR_ELEGIVEL} maxBarSize={22} />
            <Bar
              dataKey="naoElegiveis"
              name="Sem direito"
              stackId="a"
              fill={COR_NAO_ELEGIVEL}
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      </ExportCard>

      <ExportCard titulo={`Resumo por área — ${rotuloBeneficio}`} arquivo={`${arquivoBase}-por-area`}>
        <Legenda itens={[{ cor: COR_ELEGIVEL, label: "Com direito" }, { cor: COR_NAO_ELEGIVEL, label: "Sem direito" }]} />
        <ResponsiveContainer width="100%" height={Math.max(160, dados.porArea.length * 32)}>
          <BarChart data={dados.porArea} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#7590a8" }} stroke="#2a3038" />
            <YAxis type="category" dataKey="area" width={160} tick={{ fontSize: 10, fill: "#8fa0b0" }} stroke="#2a3038" />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as { areaCompleta: string; valor: number } | undefined;
                if (!p) return "";
                return dimensao === "vr" ? `${p.areaCompleta} — ${formatarMoeda(p.valor)}` : p.areaCompleta;
              }}
            />
            <Bar dataKey="elegiveis" name="Com direito" stackId="a" fill={COR_ELEGIVEL} maxBarSize={18} />
            <Bar
              dataKey="naoElegiveis"
              name="Sem direito"
              stackId="a"
              fill={COR_NAO_ELEGIVEL}
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </ExportCard>

      <ExportCard
        titulo={`Detalhamento — ${rotuloBeneficio}`}
        arquivo={`${arquivoBase}-detalhamento`}
        csv={{ headers: csvHeaders, linhas: csvLinhas }}
        pdfHref={pdfHref}
      >
        <div data-export-ignore="true" className="mb-3 flex flex-wrap gap-2.5">
          <Input
            placeholder="Buscar por nome..."
            value={buscaNome}
            onChange={(e) => setBuscaNome(e.target.value)}
            className="w-[220px]"
          />
          <Input
            placeholder="Buscar por matrícula..."
            value={buscaMatricula}
            onChange={(e) => setBuscaMatricula(e.target.value)}
            className="w-[180px]"
          />
        </div>
        {itensDetalhamento.length === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] text-text-3">
            Nenhum colaborador encontrado para essa busca.
          </p>
        ) : (
        <Table containerClassName="max-h-[70vh] overflow-y-auto">
          <TableHeader>
            <TableRow>
              <TableHead>Matrícula</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Admissão</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Motivo</TableHead>
              {dimensao === "vr" && <TableHead className="text-right">Valor</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensDetalhamento.map((i, idx) => {
              const eleg = dimensao === "cesta" ? i.elegivelCestaBasica : i.elegivelVR && i.valorVR > 0;
              const mot =
                dimensao === "cesta"
                  ? i.motivoPerdaCesta
                  : i.motivoPerdaVR ?? (i.elegivelVR && i.valorVR <= 0 ? "Valor zerado no período" : null);
              return (
                <TableRow key={`${i.matricula ?? "terceiro"}-${idx}`}>
                  <TableCell>{i.matricula ?? "—"}</TableCell>
                  <TableCell className="font-medium text-foreground">
                    {i.nome}
                    {i.tipo === "terceiro" && (
                      <Badge variant="secondary" className="ml-2">
                        terceiro
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{i.empresaNome}</TableCell>
                  <TableCell>{i.cargo ?? "—"}</TableCell>
                  <TableCell>{formatarData(i.dataAdmissao)}</TableCell>
                  <TableCell>
                    <Badge variant={eleg ? "success" : "destructive"}>{eleg ? "Com direito" : "Sem direito"}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">{mot ?? "—"}</TableCell>
                  {dimensao === "vr" && <TableCell className="text-right">{formatarMoeda(i.valorVR)}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </ExportCard>
    </div>
  );
}
