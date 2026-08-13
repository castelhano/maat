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
import { createFuncionario, deleteFuncionario, updateFuncionario } from "./actions";

type Empresa = { id: string; nome: string };
type Cargo = { id: string; nome: string; recebeCestaBasica: boolean; recebeValeRefeicao: boolean };
type Status = "ativo" | "afastado" | "desligado";

type Funcionario = {
  id: string;
  empresaId: string;
  cargoId: string;
  matricula: string;
  nome: string;
  dataAdmissao: string;
  salario: number;
  status: Status;
  dataAfastamento: string | null;
  dataDesligamento: string | null;
  recebeCestaBasica: boolean | null;
  recebeValeRefeicao: boolean | null;
  valorValeRefeicao: number | null;
  temGratificacao: boolean;
  recebeCestaComoVR: boolean;
  empresa: { nome: string };
  cargo: { nome: string; recebeCestaBasica: boolean; recebeValeRefeicao: boolean };
};

const HERANCA = ["herda", "sim", "nao"] as const;
const BOOL = ["false", "true"] as const;

// Aceita "1234", "1234.56" ou "1234,56" (não confiamos no <input type="number">
// nativo para validar — o Firefox deixa digitar qualquer caractere nele).
const NUMERO_DECIMAL = /^\d+([.,]\d{1,2})?$/;

const funcionarioFormSchema = z
  .object({
    empresaId: z.string().min(1, "Selecione a empresa"),
    cargoId: z.string().min(1, "Selecione o cargo"),
    matricula: z.string().min(1, "Informe a matrícula"),
    nome: z.string().min(1, "Informe o nome"),
    dataAdmissao: z.string().min(1, "Informe a data de admissão"),
    salario: z
      .string()
      .min(1, "Informe o salário")
      .regex(NUMERO_DECIMAL, "Informe um valor numérico válido"),
    status: z.enum(["ativo", "afastado", "desligado"]),
    dataAfastamento: z.string(),
    dataDesligamento: z.string(),
    recebeCestaBasica: z.enum(HERANCA),
    recebeValeRefeicao: z.enum(HERANCA),
    valorValeRefeicao: z
      .string()
      .refine((v) => v === "" || NUMERO_DECIMAL.test(v), "Informe um valor numérico válido"),
    temGratificacao: z.enum(BOOL),
    recebeCestaComoVR: z.enum(BOOL),
  })
  .superRefine((data, ctx) => {
    if (data.status === "afastado" && !data.dataAfastamento) {
      ctx.addIssue({ code: "custom", path: ["dataAfastamento"], message: "Informe a data de afastamento" });
    }
    if (data.status === "desligado" && !data.dataDesligamento) {
      ctx.addIssue({ code: "custom", path: ["dataDesligamento"], message: "Informe a data de desligamento" });
    }
  });

type FuncionarioFormValues = z.infer<typeof funcionarioFormSchema>;

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function paraNumero(valor: string): number {
  return Number(valor.replace(",", "."));
}

function heredaToForm(valor: boolean | null): (typeof HERANCA)[number] {
  if (valor === null) return "herda";
  return valor ? "sim" : "nao";
}

function formToHeranca(valor: (typeof HERANCA)[number]): boolean | null {
  if (valor === "herda") return null;
  return valor === "sim";
}

const STATUS_LABEL: Record<Status, string> = { ativo: "Ativo", afastado: "Afastado", desligado: "Desligado" };
const STATUS_BADGE: Record<Status, "success" | "warning" | "secondary"> = {
  ativo: "success",
  afastado: "warning",
  desligado: "secondary",
};

export function FuncionariosTable({
  funcionarios,
  empresas,
  cargos,
}: {
  funcionarios: Funcionario[];
  empresas: Empresa[];
  cargos: Cargo[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [busca, setBusca] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FuncionarioFormValues>({ resolver: zodResolver(funcionarioFormSchema) });
  const empresaId = useWatch({ control, name: "empresaId" });
  const cargoId = useWatch({ control, name: "cargoId" });
  const status = useWatch({ control, name: "status" });
  const recebeCestaBasica = useWatch({ control, name: "recebeCestaBasica" });
  const recebeValeRefeicao = useWatch({ control, name: "recebeValeRefeicao" });
  const temGratificacao = useWatch({ control, name: "temGratificacao" });
  const recebeCestaComoVR = useWatch({ control, name: "recebeCestaComoVR" });

  const funcionariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return funcionarios;
    return funcionarios.filter(
      (f) =>
        f.nome.toLowerCase().includes(termo) ||
        f.matricula.toLowerCase().includes(termo) ||
        f.cargo.nome.toLowerCase().includes(termo)
    );
  }, [funcionarios, busca]);

  function abrirCriar() {
    setEditando(null);
    reset({
      empresaId: empresas[0]?.id ?? "",
      cargoId: cargos[0]?.id ?? "",
      matricula: "",
      nome: "",
      dataAdmissao: "",
      salario: "",
      status: "ativo",
      dataAfastamento: "",
      dataDesligamento: "",
      recebeCestaBasica: "herda",
      recebeValeRefeicao: "herda",
      valorValeRefeicao: "",
      temGratificacao: "false",
      recebeCestaComoVR: "false",
    });
    setDialogOpen(true);
  }

  function abrirEditar(funcionario: Funcionario) {
    setEditando(funcionario);
    reset({
      empresaId: funcionario.empresaId,
      cargoId: funcionario.cargoId,
      matricula: funcionario.matricula,
      nome: funcionario.nome,
      dataAdmissao: funcionario.dataAdmissao.slice(0, 10),
      salario: String(funcionario.salario),
      status: funcionario.status,
      dataAfastamento: funcionario.dataAfastamento?.slice(0, 10) ?? "",
      dataDesligamento: funcionario.dataDesligamento?.slice(0, 10) ?? "",
      recebeCestaBasica: heredaToForm(funcionario.recebeCestaBasica),
      recebeValeRefeicao: heredaToForm(funcionario.recebeValeRefeicao),
      valorValeRefeicao: funcionario.valorValeRefeicao !== null ? String(funcionario.valorValeRefeicao) : "",
      temGratificacao: funcionario.temGratificacao ? "true" : "false",
      recebeCestaComoVR: funcionario.recebeCestaComoVR ? "true" : "false",
    });
    setDialogOpen(true);
  }

  function onSubmit(values: FuncionarioFormValues) {
    const payload = {
      empresaId: values.empresaId,
      cargoId: values.cargoId,
      matricula: values.matricula,
      nome: values.nome,
      dataAdmissao: values.dataAdmissao,
      salario: paraNumero(values.salario),
      status: values.status,
      dataAfastamento: values.status === "afastado" ? values.dataAfastamento : null,
      dataDesligamento: values.status === "desligado" ? values.dataDesligamento : null,
      recebeCestaBasica: formToHeranca(values.recebeCestaBasica),
      recebeValeRefeicao: formToHeranca(values.recebeValeRefeicao),
      valorValeRefeicao: values.valorValeRefeicao ? paraNumero(values.valorValeRefeicao) : null,
      temGratificacao: values.temGratificacao === "true",
      recebeCestaComoVR: values.recebeCestaComoVR === "true",
    };
    startTransition(async () => {
      const result = editando
        ? await updateFuncionario(editando.id, payload)
        : await createFuncionario(payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editando ? "Funcionário atualizado" : "Funcionário criado");
      setDialogOpen(false);
      router.refresh();
    });
  }

  function onDelete(funcionario: Funcionario) {
    if (!confirm(`Excluir "${funcionario.nome}"? Essa ação não pode ser desfeita.`)) return;
    startTransition(async () => {
      const result = await deleteFuncionario(funcionario.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Funcionário excluído");
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
            placeholder="nome, matrícula ou cargo"
            className="w-64"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button onClick={abrirCriar}>Novo funcionário</Button>} />
            <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
              <DialogDescription>
                {editando ? "Atualize os dados do funcionário." : "Cadastre um novo funcionário."}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex max-h-[70vh] min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1"
            >
              <div className="flex flex-col gap-2">
                <Label>Empresa</Label>
                <Select
                  value={empresaId}
                  onValueChange={(value) => setValue("empresaId", value as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.empresaId && (
                  <p className="font-mono text-[10px] text-destructive">{errors.empresaId.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Cargo</Label>
                <Select value={cargoId} onValueChange={(value) => setValue("cargoId", value as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.cargoId && (
                  <p className="font-mono text-[10px] text-destructive">{errors.cargoId.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="matricula">Matrícula</Label>
                <Input id="matricula" {...register("matricula")} />
                {errors.matricula && (
                  <p className="font-mono text-[10px] text-destructive">{errors.matricula.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" {...register("nome")} />
                {errors.nome && (
                  <p className="font-mono text-[10px] text-destructive">{errors.nome.message}</p>
                )}
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="dataAdmissao">Admissão</Label>
                  <Input id="dataAdmissao" type="date" {...register("dataAdmissao")} />
                  {errors.dataAdmissao && (
                    <p className="font-mono text-[10px] text-destructive">{errors.dataAdmissao.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="salario">Salário</Label>
                  <Input
                    id="salario"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    {...register("salario")}
                  />
                  {errors.salario && (
                    <p className="font-mono text-[10px] text-destructive">{errors.salario.message}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Situação</Label>
                <Select value={status} onValueChange={(value) => setValue("status", value as Status)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="afastado">Afastado</SelectItem>
                    <SelectItem value="desligado">Desligado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {status === "afastado" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="dataAfastamento">Data do afastamento</Label>
                  <Input id="dataAfastamento" type="date" {...register("dataAfastamento")} />
                  {errors.dataAfastamento && (
                    <p className="font-mono text-[10px] text-destructive">{errors.dataAfastamento.message}</p>
                  )}
                </div>
              )}

              {status === "desligado" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="dataDesligamento">Data do desligamento</Label>
                  <Input id="dataDesligamento" type="date" {...register("dataDesligamento")} />
                  {errors.dataDesligamento && (
                    <p className="font-mono text-[10px] text-destructive">{errors.dataDesligamento.message}</p>
                  )}
                </div>
              )}

              <div className="grid min-w-0 grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Cesta básica</Label>
                  <Select
                    value={recebeCestaBasica}
                    onValueChange={(value) => setValue("recebeCestaBasica", value as (typeof HERANCA)[number])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="herda">Padrão do cargo</SelectItem>
                      <SelectItem value="sim">Recebe</SelectItem>
                      <SelectItem value="nao">Não recebe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Vale-refeição</Label>
                  <Select
                    value={recebeValeRefeicao}
                    onValueChange={(value) => setValue("recebeValeRefeicao", value as (typeof HERANCA)[number])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="herda">Padrão do cargo</SelectItem>
                      <SelectItem value="sim">Recebe</SelectItem>
                      <SelectItem value="nao">Não recebe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="valorValeRefeicao">Valor vale-refeição (opcional)</Label>
                <Input
                  id="valorValeRefeicao"
                  type="text"
                  inputMode="decimal"
                  placeholder="deixe em branco para usar o cálculo padrão"
                  {...register("valorValeRefeicao")}
                />
                {errors.valorValeRefeicao && (
                  <p className="font-mono text-[10px] text-destructive">{errors.valorValeRefeicao.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Gratificação</Label>
                <Select
                  value={temGratificacao}
                  onValueChange={(value) => setValue("temGratificacao", value as (typeof BOOL)[number])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Sem gratificação</SelectItem>
                    <SelectItem value="true">Com gratificação (+40% na base do VR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Cesta como VR</Label>
                <Select
                  value={recebeCestaComoVR}
                  onValueChange={(value) => setValue("recebeCestaComoVR", value as (typeof BOOL)[number])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Recebe a cesta física</SelectItem>
                    <SelectItem value="true">Converter valor da cesta em VR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Salvando..." : editando ? "Salvar" : "Criar funcionário"}
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
            <TableHead>Matrícula</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Salário</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {funcionariosFiltrados.map((funcionario) => (
            <TableRow key={funcionario.id}>
              <TableCell>{funcionario.matricula}</TableCell>
              <TableCell className="font-medium text-foreground">{funcionario.nome}</TableCell>
              <TableCell>{funcionario.cargo.nome}</TableCell>
              <TableCell>{funcionario.empresa.nome}</TableCell>
              <TableCell>{formatarMoeda(funcionario.salario)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[funcionario.status]}>{STATUS_LABEL[funcionario.status]}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => abrirEditar(funcionario)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onDelete(funcionario)}
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
