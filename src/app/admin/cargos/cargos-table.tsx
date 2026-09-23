"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createCargo, deleteCargo, updateCargo } from "./actions";
import { SyncDepartamentoDialog } from "./sync-departamento-dialog";

type Cargo = {
  id: string;
  nome: string;
  recebeCestaBasica: boolean;
  recebeValeRefeicao: boolean;
  valorValeRefeicaoFixo: number | null;
  departamento: string | null;
  setor: string | null;
  _count: { funcionarios: number };
};

const cargoFormSchema = z.object({
  nome: z.string().min(1, "Informe o nome do cargo"),
  recebeCestaBasica: z.enum(["true", "false"]),
  recebeValeRefeicao: z.enum(["true", "false"]),
  valorValeRefeicaoFixo: z.string(),
  departamento: z.string(),
  setor: z.string(),
});

type CargoFormValues = z.infer<typeof cargoFormSchema>;

export function CargosTable({ cargos }: { cargos: Cargo[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Cargo | null>(null);
  const [busca, setBusca] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<CargoFormValues>({ resolver: zodResolver(cargoFormSchema) });
  const recebeCestaBasica = useWatch({ control, name: "recebeCestaBasica" });
  const recebeValeRefeicao = useWatch({ control, name: "recebeValeRefeicao" });

  const cargosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return cargos;
    return cargos.filter((c) => c.nome.toLowerCase().includes(termo));
  }, [cargos, busca]);

  const cargosIncompletos = useMemo(
    () => cargos.filter((c) => !c.departamento?.trim() || !c.setor?.trim()),
    [cargos]
  );

  function abrirCriar() {
    setEditando(null);
    reset({
      nome: "",
      recebeCestaBasica: "true",
      recebeValeRefeicao: "true",
      valorValeRefeicaoFixo: "",
      departamento: "",
      setor: "",
    });
    setDialogOpen(true);
  }

  function abrirEditar(cargo: Cargo) {
    setEditando(cargo);
    reset({
      nome: cargo.nome,
      recebeCestaBasica: cargo.recebeCestaBasica ? "true" : "false",
      recebeValeRefeicao: cargo.recebeValeRefeicao ? "true" : "false",
      valorValeRefeicaoFixo: cargo.valorValeRefeicaoFixo !== null ? String(cargo.valorValeRefeicaoFixo) : "",
      departamento: cargo.departamento ?? "",
      setor: cargo.setor ?? "",
    });
    setDialogOpen(true);
  }

  function onSubmit(values: CargoFormValues) {
    const valorFixo = values.valorValeRefeicaoFixo.trim();
    const payload = {
      nome: values.nome,
      recebeCestaBasica: values.recebeCestaBasica === "true",
      recebeValeRefeicao: values.recebeValeRefeicao === "true",
      valorValeRefeicaoFixo: valorFixo ? Number(valorFixo.replace(",", ".")) : null,
      departamento: values.departamento.trim() || null,
      setor: values.setor.trim() || null,
    };
    startTransition(async () => {
      const result = editando
        ? await updateCargo(editando.id, payload)
        : await createCargo(payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editando ? "Cargo atualizado" : "Cargo criado");
      setDialogOpen(false);
      router.refresh();
    });
  }

  function onDelete(cargo: Cargo) {
    if (!confirm(`Excluir o cargo "${cargo.nome}"? Essa ação não pode ser desfeita.`)) return;
    startTransition(async () => {
      const result = await deleteCargo(cargo.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Cargo excluído");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {cargosIncompletos.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-sm border border-warning/40 bg-warning/10 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[11px] font-bold tracking-[.04em] text-warning uppercase">
              {cargosIncompletos.length} cargo(s) sem departamento e/ou setor definido
            </p>
            <p className="font-mono text-[10px] text-text-2">
              {cargosIncompletos.map((c) => c.nome).join(" · ")}
            </p>
            <p className="font-mono text-[10px] text-text-3">
              Cargos sem essas informações aparecem como &quot;Não classificado&quot; nos filtros de área/departamento (ex.: Programação de Férias). Edite cada cargo abaixo para completar.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="busca">Buscar</Label>
          <Input
            id="busca"
            placeholder="nome do cargo"
            className="w-64"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="flex items-end gap-2">
          <SyncDepartamentoDialog />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={abrirCriar}>Novo cargo</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? "Editar cargo" : "Novo cargo"}</DialogTitle>
              <DialogDescription>
                {editando ? "Atualize os dados do cargo." : "Cadastre um novo cargo."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="nome">Nome do cargo</Label>
                <Input id="nome" {...register("nome")} />
                {errors.nome && (
                  <p className="font-mono text-[10px] text-destructive">{errors.nome.message}</p>
                )}
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="departamento">Departamento</Label>
                  <Input id="departamento" {...register("departamento")} placeholder="ex: OPERACAO" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="setor">Setor</Label>
                  <Input id="setor" {...register("setor")} placeholder="ex: OPERACAO" />
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Cesta básica</Label>
                  <Select
                    value={recebeCestaBasica}
                    onValueChange={(value) => setValue("recebeCestaBasica", value as "true" | "false")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Recebe</SelectItem>
                      <SelectItem value="false">Não recebe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Vale-alimentação</Label>
                  <Select
                    value={recebeValeRefeicao}
                    onValueChange={(value) => setValue("recebeValeRefeicao", value as "true" | "false")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Recebe</SelectItem>
                      <SelectItem value="false">Não recebe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="valorValeRefeicaoFixo">Valor fixo de VR (opcional)</Label>
                <Input
                  id="valorValeRefeicaoFixo"
                  {...register("valorValeRefeicaoFixo")}
                  placeholder="ex: 520,00 — deixe vazio pra calcular % do salário"
                />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Salvando..." : editando ? "Salvar" : "Criar cargo"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Table containerClassName="max-h-[60vh] overflow-y-auto">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Departamento</TableHead>
            <TableHead>Setor</TableHead>
            <TableHead>Cesta básica</TableHead>
            <TableHead>Vale-alimentação</TableHead>
            <TableHead>Valor fixo VR</TableHead>
            <TableHead>Funcionários</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cargosFiltrados.map((cargo) => {
            const incompleto = !cargo.departamento?.trim() || !cargo.setor?.trim();
            return (
            <TableRow key={cargo.id} className={incompleto ? "bg-warning/10" : undefined}>
              <TableCell className="font-medium text-foreground">{cargo.nome}</TableCell>
              <TableCell className={!cargo.departamento?.trim() ? "text-warning" : undefined}>
                {cargo.departamento?.trim() || "— pendente"}
              </TableCell>
              <TableCell className={!cargo.setor?.trim() ? "text-warning" : undefined}>
                {cargo.setor?.trim() || "— pendente"}
              </TableCell>
              <TableCell>
                <Badge variant={cargo.recebeCestaBasica ? "success" : "secondary"}>
                  {cargo.recebeCestaBasica ? "Recebe" : "Não recebe"}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={cargo.recebeValeRefeicao ? "success" : "secondary"}>
                  {cargo.recebeValeRefeicao ? "Recebe" : "Não recebe"}
                </Badge>
              </TableCell>
              <TableCell>
                {cargo.valorValeRefeicaoFixo !== null
                  ? cargo.valorValeRefeicaoFixo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                  : "—"}
              </TableCell>
              <TableCell>{cargo._count.funcionarios}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => abrirEditar(cargo)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onDelete(cargo)}
                  >
                    Excluir
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
