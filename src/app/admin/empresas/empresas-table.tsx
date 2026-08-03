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

type Empresa = {
  id: string;
  codigo: string;
  nome: string;
  _count: { funcionarios: number };
};

const empresaSchema = z.object({
  codigo: z.string().min(1, "Informe o código"),
  nome: z.string().min(1, "Informe o nome"),
});

type EmpresaValues = z.infer<typeof empresaSchema>;

export function EmpresasTable({ empresas }: { empresas: Empresa[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmpresaValues>({ resolver: zodResolver(empresaSchema) });

  function abrirCriar() {
    setEditando(null);
    reset({ codigo: "", nome: "" });
    setDialogOpen(true);
  }

  function abrirEditar(empresa: Empresa) {
    setEditando(empresa);
    reset({ codigo: empresa.codigo, nome: empresa.nome });
    setDialogOpen(true);
  }

  function onSubmit(values: EmpresaValues) {
    startTransition(async () => {
      const result = editando
        ? await updateEmpresa(editando.id, values)
        : await createEmpresa(values);
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
          <DialogTrigger render={<Button onClick={abrirCriar}>Nova empresa</Button>} />
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
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Salvando..." : editando ? "Salvar" : "Criar empresa"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Funcionários</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empresas.map((empresa) => (
            <TableRow key={empresa.id}>
              <TableCell>{empresa.codigo}</TableCell>
              <TableCell className="font-medium text-foreground">{empresa.nome}</TableCell>
              <TableCell>{empresa._count.funcionarios}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => abrirEditar(empresa)}
                  >
                    Editar
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
