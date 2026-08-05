"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
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
import { createUser, deleteUser, resetUserPassword, updateUserRole } from "./actions";

type User = {
  id: string;
  name: string;
  username: string;
  role: string;
  createdAt: Date;
};

const createUserSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  username: z
    .string()
    .min(3, "Mínimo de 3 caracteres")
    .regex(/^[a-zA-Z0-9_.]+$/, "Use apenas letras, números, ponto ou underline"),
  password: z.string().min(4, "Mínimo de 4 caracteres"),
  role: z.enum(["admin", "usuario"]),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(4, "Mínimo de 4 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export function UsersTable({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "usuario" },
  });
  const role = useWatch({ control, name: "role" });

  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    reset: resetResetForm,
    formState: { errors: resetErrors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  function onCreate(values: CreateUserValues) {
    startTransition(async () => {
      const result = await createUser(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Usuário criado com sucesso");
      reset({ name: "", username: "", password: "", role: "usuario" });
      setDialogOpen(false);
      router.refresh();
    });
  }

  function onRoleChange(userId: string, role: "admin" | "usuario") {
    startTransition(async () => {
      const result = await updateUserRole(userId, role);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function abrirResetSenha(user: User) {
    resetResetForm({ newPassword: "", confirmPassword: "" });
    setResetUser(user);
  }

  function onResetPassword(values: ResetPasswordValues) {
    if (!resetUser) return;
    startTransition(async () => {
      const result = await resetUserPassword(resetUser.id, { newPassword: values.newPassword });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Senha redefinida com sucesso");
      setResetUser(null);
      router.refresh();
    });
  }

  function onDelete(userId: string) {
    if (!confirm("Excluir este usuário? Essa ação não pode ser desfeita.")) return;
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Usuário excluído");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button>Novo usuário</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
              <DialogDescription>
                Crie um acesso e defina a permissão inicial.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" {...register("name")} />
                {errors.name && (
                  <p className="font-mono text-[10px] text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">Usuário</Label>
                <Input id="username" type="text" autoComplete="off" {...register("username")} />
                {errors.username && (
                  <p className="font-mono text-[10px] text-destructive">{errors.username.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" {...register("password")} />
                {errors.password && (
                  <p className="font-mono text-[10px] text-destructive">{errors.password.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Permissão</Label>
                <Select
                  value={role}
                  onValueChange={(value) => setValue("role", value as "admin" | "usuario")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usuario">Usuário</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Criando..." : "Criar usuário"}
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
            <TableHead>Usuário</TableHead>
            <TableHead>Permissão</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium text-foreground">{user.name}</TableCell>
              <TableCell>{user.username}</TableCell>
              <TableCell>
                <Select
                  value={user.role}
                  disabled={user.id === currentUserId || isPending}
                  onValueChange={(value) =>
                    onRoleChange(user.id, value as "admin" | "usuario")
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usuario">Usuário</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {new Intl.DateTimeFormat("pt-BR").format(user.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={user.id === currentUserId || isPending}
                    onClick={() => abrirResetSenha(user)}
                  >
                    Redefinir senha
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={user.id === currentUserId || isPending}
                    onClick={() => onDelete(user.id)}
                  >
                    Excluir
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={resetUser !== null} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para {resetUser?.name}. O usuário não será notificado.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitReset(onResetPassword)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">Nova senha</Label>
              <Input id="newPassword" type="password" {...registerReset("newPassword")} />
              {resetErrors.newPassword && (
                <p className="font-mono text-[10px] text-destructive">{resetErrors.newPassword.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input id="confirmPassword" type="password" {...registerReset("confirmPassword")} />
              {resetErrors.confirmPassword && (
                <p className="font-mono text-[10px] text-destructive">{resetErrors.confirmPassword.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Redefinir senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
