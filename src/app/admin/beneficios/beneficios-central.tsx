"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompetenciaSelect } from "@/components/competencia-select";
import { competenciaPadrao, competenciaEstaFechada } from "@/lib/competencia";
import { carregarApuracao, processarApuracao, type ApuracaoResumo, type DimensaoApuracao } from "./actions";
import { BeneficioPainel } from "./beneficio-painel";
import {
  carregarApuracaoValeGas,
  processarApuracaoValeGas,
  type ApuracaoValeGasResumo,
} from "./vale-gas-actions";
import { ValeGasPainel } from "./vale-gas-painel";

const TODAS = "__todas__";

type Aba = DimensaoApuracao | "valegas";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function mesEhPar(mes: string): boolean {
  return Number(mes) % 2 === 0;
}

export function BeneficiosCentral() {
  const padrao = competenciaPadrao();
  const [mes, setMes] = useState(padrao.mes);
  const [ano, setAno] = useState(padrao.ano);
  const [apuracao, setApuracao] = useState<ApuracaoResumo | null>(null);
  const [apuracaoValeGas, setApuracaoValeGas] = useState<ApuracaoValeGasResumo | null>(null);
  const [carregando, startCarregando] = useTransition();
  const [processando, startProcessando] = useTransition();
  const [filtroEmpresa, setFiltroEmpresa] = useState(TODAS);
  const [filtroArea, setFiltroArea] = useState(TODAS);
  const [aba, setAba] = useState<Aba>("cesta");

  const competencia = mes && ano ? `${mes}/${ano}` : "";

  const empresas = useMemo(
    () => [...new Set((apuracao?.itens ?? []).map((i) => i.empresaNome))].sort(),
    [apuracao]
  );
  const empresaIdPorNome = useMemo(
    () => new Map((apuracao?.itens ?? []).map((i) => [i.empresaNome, i.empresaId])),
    [apuracao]
  );
  const areas = useMemo(
    () => [...new Set((apuracao?.itens ?? []).map((i) => i.area ?? "Sem área"))].sort(),
    [apuracao]
  );
  const itensFiltrados = useMemo(() => {
    const itens = apuracao?.itens ?? [];
    return itens.filter((i) => {
      if (filtroEmpresa !== TODAS && i.empresaNome !== filtroEmpresa) return false;
      if (filtroArea !== TODAS && (i.area ?? "Sem área") !== filtroArea) return false;
      return true;
    });
  }, [apuracao, filtroEmpresa, filtroArea]);

  const itensValeGasFiltrados = useMemo(() => {
    const itens = apuracaoValeGas?.itens ?? [];
    return itens.filter((i) => {
      if (filtroEmpresa !== TODAS && i.empresaNome !== filtroEmpresa) return false;
      if (filtroArea !== TODAS && (i.area ?? "Sem área") !== filtroArea) return false;
      return true;
    });
  }, [apuracaoValeGas, filtroEmpresa, filtroArea]);

  function carregar(comp: string) {
    setFiltroEmpresa(TODAS);
    setFiltroArea(TODAS);
    startCarregando(async () => {
      const result = await carregarApuracao(comp);
      setApuracao(result);
    });
    const [mesComp] = comp.split("/");
    if (mesEhPar(mesComp)) {
      startCarregando(async () => {
        const result = await carregarApuracaoValeGas(comp);
        setApuracaoValeGas(result);
      });
    } else {
      setApuracaoValeGas(null);
    }
  }

  function recarregarValeGas() {
    if (competencia) {
      carregarApuracaoValeGas(competencia).then(setApuracaoValeGas);
    }
  }

  useEffect(() => {
    if (competencia) carregar(competencia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMesChange(valor: string) {
    setMes(valor);
    const comp = valor && ano ? `${valor}/${ano}` : "";
    if (comp) carregar(comp);
    else {
      setApuracao(null);
      setApuracaoValeGas(null);
    }
  }

  function handleAnoChange(valor: string) {
    setAno(valor);
    const comp = mes && valor ? `${mes}/${valor}` : "";
    if (comp) carregar(comp);
    else {
      setApuracao(null);
      setApuracaoValeGas(null);
    }
  }

  const rotuloAba: Record<Aba, string> = { cesta: "cesta básica", vr: "vale-alimentação", valegas: "vale gás" };
  const geradoEmAba = aba === "cesta" ? apuracao?.geradoCestaEm : aba === "vr" ? apuracao?.geradoVrEm : apuracaoValeGas?.geradoEm;
  const empresaSelecionadaId = filtroEmpresa === TODAS ? undefined : empresaIdPorNome.get(filtroEmpresa);
  const escopoProcessar = filtroEmpresa === TODAS ? "todas as empresas" : filtroEmpresa;
  const competenciaFechada = mes && ano ? competenciaEstaFechada({ ano: Number(ano), mes: Number(mes) }) : false;
  const valeGasMesInvalido = aba === "valegas" && mes ? !mesEhPar(mes) : false;

  function handleProcessar() {
    if (!competencia || competenciaFechada || valeGasMesInvalido) return;
    if (
      geradoEmAba &&
      !confirm(`Já existe uma apuração de ${rotuloAba[aba]} salva para ${competencia}. Reprocessar (${escopoProcessar}) vai atualizá-la com os dados atuais, sem mexer nas demais empresas nem na outra aba. Continuar?`)
    ) {
      return;
    }
    startProcessando(async () => {
      const result =
        aba === "valegas"
          ? await processarApuracaoValeGas(competencia, empresaSelecionadaId)
          : await processarApuracao(competencia, aba, empresaSelecionadaId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${rotuloAba[aba]} processada (${escopoProcessar}): ${result.resumo?.empresas} empresa(s), ${result.resumo?.itens} item(ns).`);
      carregar(competencia);
    });
  }

  const isPending = carregando || processando;
  const temAlgumDado = (apuracao?.itens.length ?? 0) > 0 || (apuracaoValeGas?.itens.length ?? 0) > 0;

  const empresasValeGas = useMemo(
    () => [...new Set((apuracaoValeGas?.itens ?? []).map((i) => i.empresaNome))].sort(),
    [apuracaoValeGas]
  );
  const areasValeGas = useMemo(
    () => [...new Set((apuracaoValeGas?.itens ?? []).map((i) => i.area ?? "Sem área"))].sort(),
    [apuracaoValeGas]
  );
  const empresasParaFiltro = aba === "valegas" ? empresasValeGas : empresas;
  const areasParaFiltro = aba === "valegas" ? areasValeGas : areas;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <CompetenciaSelect mes={mes} ano={ano} onMesChange={handleMesChange} onAnoChange={handleAnoChange} />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button onClick={handleProcessar} disabled={isPending || !competencia || competenciaFechada || valeGasMesInvalido}>
            <RefreshCw />
            {processando ? "Processando..." : `Processar ${rotuloAba[aba]}${filtroEmpresa === TODAS ? "" : ` — ${filtroEmpresa}`}`}
          </Button>
          {valeGasMesInvalido && (
            <span className="font-mono text-[10px] text-warning">
              vale gás só é apurado em meses pares (a entrega acontece em fev, abr, jun, ago, out e dez)
            </span>
          )}
          {!valeGasMesInvalido && competenciaFechada && (
            <span className="font-mono text-[10px] text-warning">
              competência fechada pra reprocessamento (prazo era até o dia 7 do mês seguinte)
            </span>
          )}
          {!valeGasMesInvalido && !competenciaFechada && geradoEmAba && (
            <span className="font-mono text-[10px] text-text-3">
              última apuração de {rotuloAba[aba]}: {formatarDataHora(geradoEmAba)}
            </span>
          )}
        </div>
      </div>

      {carregando && !apuracao && <p className="font-mono text-[11px] text-text-3">carregando...</p>}

      {!carregando && competencia && (
        <>
          {temAlgumDado && (
            <div className="flex flex-wrap gap-2.5">
              <Select value={filtroEmpresa} onValueChange={(v) => setFiltroEmpresa(v ?? TODAS)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas as empresas</SelectItem>
                  {empresasParaFiltro.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroArea} onValueChange={(v) => setFiltroArea(v ?? TODAS)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Área" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas as áreas</SelectItem>
                  {areasParaFiltro.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Tabs value={aba} onValueChange={(v) => setAba((v as Aba) ?? "cesta")}>
            <TabsList>
              <TabsIndicator />
              <TabsTab value="cesta">Cesta básica</TabsTab>
              <TabsTab value="vr">Vale-alimentação</TabsTab>
              <TabsTab value="valegas">Vale gás</TabsTab>
            </TabsList>
            <TabsPanel value="cesta" className="pt-5">
              {itensFiltrados.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
                  <p className="font-mono text-[12px] text-text-2">
                    {apuracao && apuracao.itens.length > 0
                      ? "Nenhum item para os filtros selecionados."
                      : `Nenhuma apuração de cesta básica salva para ${competencia} ainda.`}
                  </p>
                  <p className="font-mono text-[10px] text-text-3">Clique em Processar pra calcular a partir dos cadastros atuais.</p>
                </div>
              ) : (
                <BeneficioPainel
                  itens={itensFiltrados}
                  dimensao="cesta"
                  competencia={competencia}
                  filtroEmpresa={filtroEmpresa === TODAS ? undefined : filtroEmpresa}
                  filtroArea={filtroArea === TODAS ? undefined : filtroArea}
                />
              )}
            </TabsPanel>
            <TabsPanel value="vr" className="pt-5">
              {itensFiltrados.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
                  <p className="font-mono text-[12px] text-text-2">
                    {apuracao && apuracao.itens.length > 0
                      ? "Nenhum item para os filtros selecionados."
                      : `Nenhuma apuração de vale-alimentação salva para ${competencia} ainda.`}
                  </p>
                  <p className="font-mono text-[10px] text-text-3">Clique em Processar pra calcular a partir dos cadastros atuais.</p>
                </div>
              ) : (
                <BeneficioPainel
                  itens={itensFiltrados}
                  dimensao="vr"
                  competencia={competencia}
                  filtroEmpresa={filtroEmpresa === TODAS ? undefined : filtroEmpresa}
                  filtroArea={filtroArea === TODAS ? undefined : filtroArea}
                />
              )}
            </TabsPanel>
            <TabsPanel value="valegas" className="pt-5">
              {!mes || mesEhPar(mes) ? (
                itensValeGasFiltrados.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
                    <p className="font-mono text-[12px] text-text-2">
                      {apuracaoValeGas && apuracaoValeGas.itens.length > 0
                        ? "Nenhum item para os filtros selecionados."
                        : `Nenhuma apuração de vale gás salva para ${competencia} ainda.`}
                    </p>
                    <p className="font-mono text-[10px] text-text-3">Clique em Processar pra calcular a partir dos cadastros atuais.</p>
                  </div>
                ) : (
                  <ValeGasPainel
                    itens={itensValeGasFiltrados}
                    competencia={competencia}
                    periodoInicio={apuracaoValeGas!.periodoInicio}
                    periodoFim={apuracaoValeGas!.periodoFim}
                    valorEntregaPorEmpresa={apuracaoValeGas!.valorEntregaPorEmpresa}
                    filtroEmpresa={filtroEmpresa === TODAS ? undefined : filtroEmpresa}
                    filtroArea={filtroArea === TODAS ? undefined : filtroArea}
                    onValorSalvo={recarregarValeGas}
                  />
                )
              ) : (
                <p className="py-6 text-center font-mono text-[11px] text-text-3">
                  Vale gás só é apurado em meses pares — selecione fevereiro, abril, junho, agosto, outubro ou dezembro.
                </p>
              )}
            </TabsPanel>
          </Tabs>
        </>
      )}
    </div>
  );
}
