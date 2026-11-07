"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createEmpresa, deleteEmpresa, updateEmpresa } from "./actions";
import { usePodeOperar } from "@/components/permissoes-provider";
import type { RegrasEmpresa } from "@/lib/regras-empresa";
import { RegrasDialog, type FuncionarioCidade } from "./regras-dialog";

type Empresa = {
  id: string;
  codigo: string;
  nome: string;
  abbr: string | null;
  valorCestaBasica: number | null;
  _count: { funcionarios: number };
  regras: RegrasEmpresa;
  funcionariosCidade: FuncionarioCidade[];
};

// Resumo do que a empresa faz diferente das regras originais.
function resumoRegras(r: RegrasEmpresa): string {
  const partes: string[] = [];
  if (r.beneficioPeriodoDiaInicio !== null) partes.push(`benefícios ${r.beneficioPeriodoDiaInicio} a ${r.beneficioPeriodoDiaInicio - 1}`);
  if (r.faltasPerdeBeneficio !== 3) partes.push(`perde com ${r.faltasPerdeBeneficio} faltas`);
  if (r.valeGasMensal) partes.push("vale gás mensal");
  if (!r.valeGasRegraSuspensao) partes.push("sem regra de suspensão");
  if (r.vaRegra === "fixo") partes.push("VA fixo");
  if (r.vaDiaMantemDesligado !== 25) partes.push(`VA desligado a partir do dia ${r.vaDiaMantemDesligado}`);
  if (r.cidades.length > 0) partes.push(`${r.cidades.length} cidades`);
  if (r.bancoHorasModo === "extrato") partes.push("BH pelo extrato");
  if (r.feriasCalendario === "mensal") partes.push("férias mensal");
  return partes.length > 0 ? partes.join(" · ") : "padrão";
}

const NUMERO_DECIMAL = /^\d+([.,]\d{1,2})?$/;

function paraNumero(valor: string): number {
  return Number(valor.replace(",", "."));
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const empresaSchema = z.object({
  codigo: z.string().min(1, "Informe o código"),
  nome: z.string().min(1, "Informe o nome"),
  abbr: z.string(),
  valorCestaBasica: z
    .string()
    .refine((v) => v === "" || NUMERO_DECIMAL.test(v), "Informe um valor numérico válido"),
});

type EmpresaValues = z.infer<typeof empresaSchema>;

export function EmpresasTable({ empresas }: { empresas: Empresa[] }) {
  const podeOperar = usePodeOperar("empresas");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [regrasDe, setRegrasDe] = useState<Empresa | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmpresaValues>({ resolver: zodResolver(empresaSchema) });

  function abrirCriar() {
    setEditando(null);
    reset({ codigo: "", nome: "", abbr: "", valorCestaBasica: "" });
    setDialogOpen(true);
  }

  function abrirEditar(empresa: Empresa) {
    setEditando(empresa);
    reset({
      codigo: empresa.codigo,
      nome: empresa.nome,
      abbr: empresa.abbr ?? "",
      valorCestaBasica: empresa.valorCestaBasica !== null ? String(empresa.valorCestaBasica) : "",
    });
    setDialogOpen(true);
  }

  function onSubmit(values: EmpresaValues) {
    const payload = {
      ...values,
      abbr: values.abbr || null,
      valorCestaBasica: values.valorCestaBasica ? paraNumero(values.valorCestaBasica) : null,
    };
    startTransition(async () => {
      const result = editando
        ? await updateEmpresa(editando.id, payload)
        : await createEmpresa(payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editando ? "Empresa atualizada" : "Empresa criada");
      setDialogOpen(false);
      router.refresh();
    });
  }

  function onDelete(empresa: Empresa) {
    if (!confirm(`Excluir a empresa "${empresa.nome}"? Essa ação não pode ser desfeita.`)) return;
    startTransition(async () => {
      const result = await deleteEmpresa(empresa.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Empresa excluída");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {podeOperar && <DialogTrigger render={<Button onClick={abrirCriar}>Nova empresa</Button>} />}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? "Editar empresa" : "Nova empresa"}</DialogTitle>
              <DialogDescription>
                {editando ? "Atualize os dados da empresa." : "Cadastre uma nova empresa."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="codigo">Código</Label>
                <Input id="codigo" {...register("codigo")} />
                {errors.codigo && (
                  <p className="font-mono text-[10px] text-destructive">{errors.codigo.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" {...register("nome")} />
                {errors.nome && (
                  <p className="font-mono text-[10px] text-destructive">{errors.nome.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="abbr">Nome curto (opcional)</Label>
                <Input id="abbr" placeholder="usado em gráficos e resumos" {...register("abbr")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="valorCestaBasica">Valor da cesta básica (opcional)</Label>
                <Input
                  id="valorCestaBasica"
                  placeholder="usado quando o colaborador opta por receber a cesta como VR"
                  inputMode="decimal"
                  {...register("valorCestaBasica")}
                />
                {errors.valorCestaBasica && (
                  <p className="font-mono text-[10px] text-destructive">{errors.valorCestaBasica.message}</p>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Salvando..." : editando ? "Salvar" : "Criar empresa"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table containerClassName="max-h-[60vh] overflow-y-auto">
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Nome curto</TableHead>
            <TableHead>Cesta básica</TableHead>
            <TableHead>Regras</TableHead>
            <TableHead>Funcionários</TableHead>
            <TableHead className="text-right">{podeOperar ? "Ações" : ""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empresas.map((empresa) => (
            <TableRow key={empresa.id}>
              <TableCell>{empresa.codigo}</TableCell>
              <TableCell className="font-medium text-foreground">{empresa.nome}</TableCell>
              <TableCell>{empresa.abbr ?? "—"}</TableCell>
              <TableCell>
                {empresa.valorCestaBasica !== null ? formatarMoeda(empresa.valorCestaBasica) : "—"}
              </TableCell>
              <TableCell className="font-mono text-[10px] text-text-2">{resumoRegras(empresa.regras)}</TableCell>
              <TableCell>{empresa._count.funcionarios}</TableCell>
              <TableCell className="text-right">
                {podeOperar && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => abrirEditar(empresa)}
                  >
                    Editar
                  </Button>
                  <Button variant="secondary" size="sm" disabled={isPending} onClick={() => setRegrasDe(empresa)}>
                    Regras
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onDelete(empresa)}
                  >
                    Excluir
                  </Button>
                </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {regrasDe && (
        <RegrasDialog
          key={regrasDe.id}
          empresa={empresas.find((e) => e.id === regrasDe.id) ?? regrasDe}
          open
          onOpenChange={(aberto) => !aberto && setRegrasDe(null)}
        />
      )}
    </div>
  );
}
