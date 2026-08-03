"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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

type Cargo = {
  id: string;
  nome: string;
  recebeCestaBasica: boolean;
  recebeValeRefeicao: boolean;
  _count: { funcionarios: number };
};

const cargoFormSchema = z.object({
  nome: z.string().min(1, "Informe o nome do cargo"),
  recebeCestaBasica: z.enum(["true", "false"]),
  recebeValeRefeicao: z.enum(["true", "false"]),
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

  function abrirCriar() {
    setEditando(null);
    reset({ nome: "", recebeCestaBasica: "true", recebeValeRefeicao: "true" });
    setDialogOpen(true);
  }

  function abrirEditar(cargo: Cargo) {
    setEditando(cargo);
    reset({
      nome: cargo.nome,
      recebeCestaBasica: cargo.recebeCestaBasica ? "true" : "false",
      recebeValeRefeicao: cargo.recebeValeRefeicao ? "true" : "false",
    });
    setDialogOpen(true);
  }

  function onSubmit(values: CargoFormValues) {
    const payload = {
      nome: values.nome,
      recebeCestaBasica: values.recebeCestaBasica === "true",
      recebeValeRefeicao: values.recebeValeRefeicao === "true",
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
                  <Label>Vale-refeição</Label>
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

              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Salvando..." : editando ? "Salvar" : "Criar cargo"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Cesta básica</TableHead>
            <TableHead>Vale-refeição</TableHead>
            <TableHead>Funcionários</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cargosFiltrados.map((cargo) => (
            <TableRow key={cargo.id}>
              <TableCell className="font-medium text-foreground">{cargo.nome}</TableCell>
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
