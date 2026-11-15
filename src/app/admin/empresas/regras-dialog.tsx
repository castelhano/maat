"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RegrasEmpresa } from "@/lib/regras-empresa";
import { salvarCidadeFuncionario, salvarRegrasEmpresa } from "./actions";

export type FuncionarioCidade = { id: string; matricula: string; nome: string; cidade: string | null };

const selectCls =
  "h-8 w-full rounded-sm border border-border-hi bg-secondary px-2.5 font-mono text-[11px] text-foreground outline-none focus-visible:border-primary";
const labelCls = "mb-1 block font-mono text-[10px] font-bold tracking-[.06em] text-text-3 uppercase";
const textareaCls =
  "min-h-[64px] w-full rounded-sm border border-border-hi bg-secondary px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:text-text-3 focus-visible:border-primary";
const ajudaCls = "mt-1 font-mono text-[10px] text-text-3";

function numeroBr(v: number | null): string {
  return v === null ? "" : v.toFixed(2).replace(".", ",");
}

function lerNumero(texto: string): number | null {
  // "1.234,56" ou "653,28" (vírgula decimal) e também "653.28".
  const bruto = texto.trim();
  const t = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

// "MOT RODOVIARIO = 653,28" por linha.
function lerExcecoes(texto: string): { cargo: string; valor: number }[] | string {
  const lista: { cargo: string; valor: number }[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const [cargo, valor] = linha.split("=").map((p) => p.trim());
    const n = lerNumero(valor ?? "");
    if (!cargo || n === null || Number.isNaN(n)) return `Linha inválida nas exceções de VA: "${linha}" (use FUNÇÃO = valor).`;
    lista.push({ cargo: cargo.toUpperCase(), valor: n });
  }
  return lista;
}

// "0001 = Cuiabá = 117,00" por linha (valor do vale gás opcional).
function lerCidades(texto: string): { codigo: string; nome: string; valorValeGas: number | null }[] | string {
  const lista: { codigo: string; nome: string; valorValeGas: number | null }[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const [codigo, nome, valor] = linha.split("=").map((p) => p.trim());
    const n = lerNumero(valor ?? "");
    if (!codigo || !/^\d{1,6}$/.test(codigo) || !nome || Number.isNaN(n)) {
      return `Linha inválida nas cidades: "${linha}" (use código = cidade = valor do vale gás).`;
    }
    lista.push({ codigo, nome, valorValeGas: n });
  }
  return lista;
}

export function RegrasDialog({
  empresa,
  open,
  onOpenChange,
}: {
  empresa: { id: string; nome: string; regras: RegrasEmpresa; funcionariosCidade: FuncionarioCidade[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const r = empresa.regras;

  const [periodoDia, setPeriodoDia] = useState(r.beneficioPeriodoDiaInicio !== null ? String(r.beneficioPeriodoDiaInicio) : "");
  const [faltasPerde, setFaltasPerde] = useState(String(r.faltasPerdeBeneficio));
  const [valeGasMensal, setValeGasMensal] = useState(r.valeGasMensal);
  const [regraSuspensao, setRegraSuspensao] = useState(r.valeGasRegraSuspensao);
  const [vaRegra, setVaRegra] = useState(r.vaRegra);
  const [vaValorFixo, setVaValorFixo] = useState(numeroBr(r.vaValorFixo));
  const [vaDiaDesligado, setVaDiaDesligado] = useState(String(r.vaDiaMantemDesligado));
  const [cestaDiaDesligado, setCestaDiaDesligado] = useState(r.cestaDiaMantemDesligado !== null ? String(r.cestaDiaMantemDesligado) : "");
  const [vaExcecoes, setVaExcecoes] = useState(r.vaValoresPorCargo.map((v) => `${v.cargo} = ${numeroBr(v.valor)}`).join("\n"));
  const [cidades, setCidades] = useState(
    r.cidades.map((c) => `${c.codigo} = ${c.nome}${c.valorValeGas !== null ? ` = ${numeroBr(c.valorValeGas)}` : ""}`).join("\n")
  );
  const [bancoHorasModo, setBancoHorasModo] = useState(r.bancoHorasModo);
  const [feriasCalendario, setFeriasCalendario] = useState(r.feriasCalendario);
  const [busca, setBusca] = useState("");

  const nomesCidades = r.cidades.map((c) => c.nome);
  const funcionarios = useMemo(() => {
    const t = busca.trim().toLowerCase();
    // Sem busca, mostra só quem está sem cidade (os que precisam de ajuste).
    if (!t) return empresa.funcionariosCidade.filter((f) => !f.cidade);
    return empresa.funcionariosCidade.filter((f) => f.matricula.includes(t) || f.nome.toLowerCase().includes(t));
  }, [busca, empresa.funcionariosCidade]);

  function salvar() {
    const dia = periodoDia.trim() ? Number(periodoDia) : null;
    if (dia !== null && (!Number.isInteger(dia) || dia < 2 || dia > 28)) {
      toast.error("Dia de início do período: entre 2 e 28 (ou vazio para mês cheio).");
      return;
    }
    const faltas = Number(faltasPerde);
    if (!Number.isInteger(faltas) || faltas < 1) {
      toast.error("Quantidade de faltas inválida.");
      return;
    }
    const valorFixo = lerNumero(vaValorFixo);
    if (Number.isNaN(valorFixo)) {
      toast.error("Valor fixo do VA inválido.");
      return;
    }
    const diaDesligado = Number(vaDiaDesligado);
    if (!Number.isInteger(diaDesligado) || diaDesligado < 1 || diaDesligado > 32) {
      toast.error("VA de desligado: informe um dia entre 1 e 31 (32 = desligado nunca mantém).");
      return;
    }
    const cestaDia = cestaDiaDesligado.trim() ? Number(cestaDiaDesligado) : null;
    if (cestaDia !== null && (!Number.isInteger(cestaDia) || cestaDia < 1 || cestaDia > 31)) {
      toast.error("Cesta de desligado: informe um dia entre 1 e 31 (ou vazio = desligado perde).");
      return;
    }
    const excecoes = lerExcecoes(vaExcecoes);
    if (typeof excecoes === "string") {
      toast.error(excecoes);
      return;
    }
    const listaCidades = lerCidades(cidades);
    if (typeof listaCidades === "string") {
      toast.error(listaCidades);
      return;
    }
    startTransition(async () => {
      const result = await salvarRegrasEmpresa(empresa.id, {
        beneficioPeriodoDiaInicio: dia,
        faltasPerdeBeneficio: faltas,
        valeGasMensal,
        valeGasRegraSuspensao: regraSuspensao,
        vaRegra,
        vaValorFixo: valorFixo,
        vaValoresPorCargo: excecoes,
        vaDiaMantemDesligado: diaDesligado,
        cestaDiaMantemDesligado: cestaDia,
        cidades: listaCidades,
        bancoHorasModo,
        feriasCalendario,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Regras de ${empresa.nome} salvas.`);
      onOpenChange(false);
      router.refresh();
    });
  }

  function mudarCidade(f: FuncionarioCidade, cidade: string) {
    startTransition(async () => {
      const result = await salvarCidadeFuncionario(f.id, cidade || null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${f.matricula} — cidade ${cidade || "removida"}.`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Regras — {empresa.nome}</DialogTitle>
          <DialogDescription>
            Os valores iniciais são as regras das empresas originais. Mude só o que esta empresa faz diferente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <p className="font-mono text-[11px] font-bold text-foreground">Cesta básica e vale gás</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Dia de início do período</label>
                <Input value={periodoDia} onChange={(e) => setPeriodoDia(e.target.value)} placeholder="vazio = mês cheio" inputMode="numeric" />
                <p className={ajudaCls}>ex.: 21 = de 21 do mês anterior a 20 do mês da competência</p>
              </div>
              <div>
                <label className={labelCls}>Perde com quantas faltas (ou mais)</label>
                <Input value={faltasPerde} onChange={(e) => setFaltasPerde(e.target.value)} inputMode="numeric" />
                <p className={ajudaCls}>3 = &quot;mais de 2 faltas&quot; (regra original)</p>
              </div>
              <div>
                <label className={labelCls}>Vale gás</label>
                <select className={selectCls} value={valeGasMensal ? "mensal" : "bimestral"} onChange={(e) => setValeGasMensal(e.target.value === "mensal")}>
                  <option value="bimestral">Bimestral (meses pares, 15 a 14)</option>
                  <option value="mensal">Todo mês (mesmo período da cesta)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Desligado recebe a cesta se sair a partir do dia</label>
                <Input value={cestaDiaDesligado} onChange={(e) => setCestaDiaDesligado(e.target.value)} placeholder="vazio = desligado perde" inputMode="numeric" />
                <p className={ajudaCls}>vazio = regra original (desligado perde); ex.: 28</p>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 font-mono text-[11px] text-text-2">
                  <input type="checkbox" checked={regraSuspensao} onChange={(e) => setRegraSuspensao(e.target.checked)} />
                  Vale gás: perde com faltas + suspensões somando 4 ou mais
                </label>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <p className="font-mono text-[11px] font-bold text-foreground">Vale-alimentação</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Regra</label>
                <select className={selectCls} value={vaRegra} onChange={(e) => setVaRegra(e.target.value as RegrasEmpresa["vaRegra"])}>
                  <option value="percentual">8% do salário (mín. 225 / máx. 520)</option>
                  <option value="fixo">Valor fixo da empresa</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Desligado mantém o VA se sair a partir do dia</label>
                <Input value={vaDiaDesligado} onChange={(e) => setVaDiaDesligado(e.target.value)} inputMode="numeric" />
                <p className={ajudaCls}>25 = regra original; 32 = desligado nunca mantém (pago na rescisão)</p>
              </div>
              {vaRegra === "fixo" && (
                <div>
                  <label className={labelCls}>Valor fixo (demais funções)</label>
                  <Input value={vaValorFixo} onChange={(e) => setVaValorFixo(e.target.value)} placeholder="ex.: 341,00" inputMode="decimal" />
                </div>
              )}
            </div>
            {vaRegra === "fixo" && (
              <div>
                <label className={labelCls}>Valor por função (uma por linha)</label>
                <textarea className={textareaCls} value={vaExcecoes} onChange={(e) => setVaExcecoes(e.target.value)} placeholder="MOT RODOVIARIO = 653,28" />
                <p className={ajudaCls}>nome da função como vem do ERP = valor. Vale só para esta empresa.</p>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <p className="font-mono text-[11px] font-bold text-foreground">Cidades (valor do vale gás por cidade)</p>
            <div>
              <textarea className={textareaCls} value={cidades} onChange={(e) => setCidades(e.target.value)} placeholder={"0001 = Cuiabá = 117,00\n0099 = Rondonópolis = 118,00"} />
              <p className={ajudaCls}>
                código do 2º bloco da Divisão da folha (ex.: 0011.<b>0099</b>.0075.0001) = cidade = valor do vale gás. Vazio = empresa sem
                cidades.
              </p>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Banco de horas</label>
              <select className={selectCls} value={bancoHorasModo} onChange={(e) => setBancoHorasModo(e.target.value as RegrasEmpresa["bancoHorasModo"])}>
                <option value="calculado">Calculado pelo app (regra original)</option>
                <option value="extrato">Pelo extrato do ERP (fecha no mês)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Calendário de férias</label>
              <select className={selectCls} value={feriasCalendario} onChange={(e) => setFeriasCalendario(e.target.value as RegrasEmpresa["feriasCalendario"])}>
                <option value="quinzena">Quinzenas (calendário compartilhado)</option>
                <option value="mensal">Uma data por mês (calendário próprio)</option>
              </select>
            </div>
          </section>

          {nomesCidades.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="font-mono text-[11px] font-bold text-foreground">Cidade dos funcionários</p>
              <p className={ajudaCls}>
                Preenchida pela Divisão ao importar a folha. Sem busca, mostra só quem está sem cidade. Ajuste aqui quando a Divisão no ERP estiver
                errada.
              </p>
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar por matrícula ou nome..." className="w-[260px]" />
              {funcionarios.length === 0 ? (
                <p className="font-mono text-[10px] text-text-3">{busca ? "Ninguém encontrado." : "Todos os funcionários têm cidade."}</p>
              ) : (
                <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto">
                  {funcionarios.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="w-[60px] text-text-3">{f.matricula}</span>
                      <span className="flex-1 truncate text-foreground">{f.nome}</span>
                      <select
                        className={`${selectCls} w-[160px]`}
                        value={f.cidade ?? ""}
                        disabled={isPending}
                        onChange={(e) => mudarCidade(f, e.target.value)}
                      >
                        <option value="">Sem cidade</option>
                        {nomesCidades.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button onClick={salvar} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar regras"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
