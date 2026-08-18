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
import { competenciaPadrao } from "@/lib/competencia";
import { carregarApuracao, processarApuracao, type ApuracaoResumo } from "./actions";
import { BeneficioPainel } from "./beneficio-painel";

const TODAS = "__todas__";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export function BeneficiosCentral() {
  const padrao = competenciaPadrao();
  const [mes, setMes] = useState(padrao.mes);
  const [ano, setAno] = useState(padrao.ano);
  const [apuracao, setApuracao] = useState<ApuracaoResumo | null>(null);
  const [carregando, startCarregando] = useTransition();
  const [processando, startProcessando] = useTransition();
  const [filtroEmpresa, setFiltroEmpresa] = useState(TODAS);
  const [filtroArea, setFiltroArea] = useState(TODAS);

  const competencia = mes && ano ? `${mes}/${ano}` : "";

  const empresas = useMemo(
    () => [...new Set((apuracao?.itens ?? []).map((i) => i.empresaNome))].sort(),
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

  function carregar(comp: string) {
    setFiltroEmpresa(TODAS);
    setFiltroArea(TODAS);
    startCarregando(async () => {
      const result = await carregarApuracao(comp);
      setApuracao(result);
    });
  }

  useEffect(() => {
    if (competencia) carregar(competencia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMesChange(valor: string) {
    setMes(valor);
    const comp = valor && ano ? `${valor}/${ano}` : "";
    if (comp) carregar(comp);
    else setApuracao(null);
  }

  function handleAnoChange(valor: string) {
    setAno(valor);
    const comp = mes && valor ? `${mes}/${valor}` : "";
    if (comp) carregar(comp);
    else setApuracao(null);
  }

  function handleProcessar() {
    if (!competencia) return;
    if (
      apuracao &&
      apuracao.itens.length > 0 &&
      !confirm(`Já existe uma apuração salva para ${competencia} (gerada em ${formatarDataHora(apuracao.geradoEm!)}). Reprocessar vai substituí-la com os dados atuais. Continuar?`)
    ) {
      return;
    }
    startProcessando(async () => {
      const result = await processarApuracao(competencia);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Apuração processada: ${result.resumo?.empresas} empresa(s), ${result.resumo?.itens} item(ns).`);
      carregar(competencia);
    });
  }

  const isPending = carregando || processando;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <CompetenciaSelect mes={mes} ano={ano} onMesChange={handleMesChange} onAnoChange={handleAnoChange} />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button onClick={handleProcessar} disabled={isPending || !competencia}>
            <RefreshCw />
            {processando ? "Processando..." : "Processar"}
          </Button>
          {apuracao?.geradoEm && (
            <span className="font-mono text-[10px] text-text-3">
              última apuração: {formatarDataHora(apuracao.geradoEm)}
            </span>
          )}
        </div>
      </div>

      {carregando && !apuracao && <p className="font-mono text-[11px] text-text-3">carregando...</p>}

      {!carregando && apuracao && apuracao.itens.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-hi px-6 py-14 text-center">
          <p className="font-mono text-[12px] text-text-2">
            Nenhuma apuração salva para {competencia} ainda.
          </p>
          <p className="font-mono text-[10px] text-text-3">
            Clique em Processar pra calcular a partir dos cadastros atuais.
          </p>
        </div>
      )}

      {apuracao && apuracao.itens.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2.5">
            <Select value={filtroEmpresa} onValueChange={(v) => setFiltroEmpresa(v ?? TODAS)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as empresas</SelectItem>
                {empresas.map((e) => (
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
                {areas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {itensFiltrados.length === 0 ? (
            <p className="py-6 text-center font-mono text-[11px] text-text-3">
              Nenhum item para os filtros selecionados.
            </p>
          ) : (
            <Tabs defaultValue="cesta">
              <TabsList>
                <TabsIndicator />
                <TabsTab value="cesta">Cesta básica</TabsTab>
                <TabsTab value="vr">Vale-refeição</TabsTab>
              </TabsList>
              <TabsPanel value="cesta" className="pt-5">
                <BeneficioPainel
                  itens={itensFiltrados}
                  dimensao="cesta"
                  competencia={competencia}
                  filtroEmpresa={filtroEmpresa === TODAS ? undefined : filtroEmpresa}
                  filtroArea={filtroArea === TODAS ? undefined : filtroArea}
                />
              </TabsPanel>
              <TabsPanel value="vr" className="pt-5">
                <BeneficioPainel
                  itens={itensFiltrados}
                  dimensao="vr"
                  competencia={competencia}
                  filtroEmpresa={filtroEmpresa === TODAS ? undefined : filtroEmpresa}
                  filtroArea={filtroArea === TODAS ? undefined : filtroArea}
                />
              </TabsPanel>
            </Tabs>
          )}
        </>
      )}
    </div>
  );
}
