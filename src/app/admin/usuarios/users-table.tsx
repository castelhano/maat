"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { MODULOS, type MapaPermissoes, type Modulo, type Nivel } from "@/lib/permissoes";
import {
  createUser,
  deleteUser,
  resetUserPassword,
  setUserAtivo,
  setUserPermissoes,
  setUserTrocarSenha,
  updateUserRole,
} from "./actions";

type User = {
  id: string;
  name: string;
  username: string;
  role: string;
  ativo: boolean;
  trocarSenha: boolean;
  createdAt: Date;
  permissoes: { modulo: string; nivel: string }[];
};

const createUserSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  username: z
    .string()
    .min(3, "Mínimo de 3 caracteres")
    .regex(/^[a-zA-Z0-9_.]+$/, "Use apenas letras, números, ponto ou underline"),
  password: z.string().min(4, "Mínimo de 4 caracteres"),
  role: z.enum(["admin", "usuario"]),
  trocarSenha: z.boolean(),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(4, "Mínimo de 4 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a senha"),
    trocarSenha: z.boolean(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

const NIVEL_LABEL: Record<Nivel | "nenhum", string> = {
  nenhum: "Sem acesso",
  consultar: "Consultar",
  operar: "Operar",
};

function paraMapa(permissoes: User["permissoes"]): MapaPermissoes {
  return Object.fromEntries(permissoes.map((p) => [p.modulo, p.nivel])) as MapaPermissoes;
}

function resumoRotinas(user: User) {
  if (user.role === "admin") return "todas";
  const n = user.permissoes.length;
  if (n === 0) return "nenhuma";
  return `${n} de ${MODULOS.length}`;
}

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
  const [permissoesUser, setPermissoesUser] = useState<User | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "usuario", trocarSenha: true },
  });
  const role = useWatch({ control, name: "role" });

  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    reset: resetResetForm,
    formState: { errors: resetErrors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  function executar(acao: () => Promise<{ error: string | null }>, sucesso?: string, depois?: () => void) {
    startTransition(async () => {
      const result = await acao();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (sucesso) toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }

  function onCreate(values: CreateUserValues) {
    executar(() => createUser(values), "Usuário criado com sucesso", () => {
      reset({ name: "", username: "", password: "", role: "usuario", trocarSenha: true });
      setDialogOpen(false);
    });
  }

  function onRoleChange(userId: string, role: "admin" | "usuario") {
    executar(() => updateUserRole(userId, role));
  }

  function abrirResetSenha(user: User) {
    resetResetForm({ newPassword: "", confirmPassword: "", trocarSenha: true });
    setResetUser(user);
  }

  function onResetPassword(values: ResetPasswordValues) {
    if (!resetUser) return;
    executar(
      () => resetUserPassword(resetUser.id, { newPassword: values.newPassword, trocarSenha: values.trocarSenha }),
      "Senha redefinida com sucesso",
      () => setResetUser(null),
    );
  }

  function onAlternarTrocaSenha(user: User) {
    executar(
      () => setUserTrocarSenha(user.id, !user.trocarSenha),
      user.trocarSenha ? "Exigência de troca de senha cancelada" : "Troca de senha exigida no próximo acesso",
      () => setResetUser(null),
    );
  }

  function onAlternarAtivo(user: User) {
    if (user.ativo && !confirm(`Desativar ${user.name}? A pessoa sai do sistema na hora e não consegue mais entrar.`)) {
      return;
    }
    executar(() => setUserAtivo(user.id, !user.ativo), user.ativo ? "Usuário desativado" : "Usuário reativado");
  }

  function onDelete(userId: string) {
    if (!confirm("Excluir este usuário? Essa ação não pode ser desfeita.")) return;
    executar(() => deleteUser(userId), "Usuário excluído");
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
                Crie um acesso. As rotinas liberadas são definidas depois, em Permissões.
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
                <Label>Perfil</Label>
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
              <CheckboxTrocaSenha {...register("trocarSenha")} />
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
            <TableHead>Perfil</TableHead>
            <TableHead>Rotinas</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const proprio = user.id === currentUserId;
            return (
              <TableRow key={user.id} className={user.ativo ? undefined : "opacity-60"}>
                <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>
                  <Select
                    value={user.role}
                    disabled={proprio || isPending}
                    onValueChange={(value) => onRoleChange(user.id, value as "admin" | "usuario")}
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
                <TableCell>{resumoRotinas(user)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={user.ativo ? "success" : "destructive"}>{user.ativo ? "Ativo" : "Inativo"}</Badge>
                    {user.trocarSenha && <Badge variant="warning">Trocar senha</Badge>}
                  </div>
                </TableCell>
                <TableCell>{new Intl.DateTimeFormat("pt-BR").format(user.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={user.role === "admin" || isPending}
                      title={user.role === "admin" ? "Administrador acessa todas as rotinas" : undefined}
                      onClick={() => setPermissoesUser(user)}
                    >
                      Permissões
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={proprio || isPending}
                      onClick={() => abrirResetSenha(user)}
                    >
                      Senha
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={proprio || isPending}
                      onClick={() => onAlternarAtivo(user)}
                    >
                      {user.ativo ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={proprio || isPending}
                      onClick={() => onDelete(user.id)}
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

      <Dialog open={resetUser !== null} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha de {resetUser?.name}</DialogTitle>
            <DialogDescription>
              Defina uma nova senha. O usuário não será notificado.
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
            <CheckboxTrocaSenha {...registerReset("trocarSenha")} />
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => resetUser && onAlternarTrocaSenha(resetUser)}
              >
                {resetUser?.trocarSenha ? "Cancelar exigência de troca" : "Só exigir troca no próximo acesso"}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Redefinir senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {permissoesUser && (
        <PermissoesDialog
          key={permissoesUser.id}
          user={permissoesUser}
          outros={users.filter((u) => u.id !== permissoesUser.id && u.role !== "admin" && u.permissoes.length > 0)}
          isPending={isPending}
          onClose={() => setPermissoesUser(null)}
          onSalvar={(mapa) =>
            executar(
              () =>
                setUserPermissoes(
                  permissoesUser.id,
                  Object.entries(mapa).map(([modulo, nivel]) => ({ modulo, nivel: nivel as Nivel })),
                ),
              "Permissões salvas",
              () => setPermissoesUser(null),
            )
          }
        />
      )}
    </div>
  );
}

function CheckboxTrocaSenha(props: React.ComponentProps<"input">) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="size-3.5 accent-primary" {...props} />
      <span className="font-mono text-[11px] text-text-2">Exigir troca de senha no próximo acesso</span>
    </label>
  );
}

function PermissoesDialog({
  user,
  outros,
  isPending,
  onClose,
  onSalvar,
}: {
  user: User;
  outros: User[];
  isPending: boolean;
  onClose: () => void;
  onSalvar: (mapa: MapaPermissoes) => void;
}) {
  const [mapa, setMapa] = useState<MapaPermissoes>(() => paraMapa(user.permissoes));

  function definir(modulo: Modulo, nivel: Nivel | "nenhum") {
    setMapa((prev) => {
      const novo = { ...prev };
      if (nivel === "nenhum") delete novo[modulo];
      else novo[modulo] = nivel;
      return novo;
    });
  }

  function definirTodas(nivel: Nivel | "nenhum") {
    setMapa(
      nivel === "nenhum" ? {} : (Object.fromEntries(MODULOS.map((m) => [m.chave, nivel])) as MapaPermissoes),
    );
  }

  function copiarDe(userId: string) {
    const origem = outros.find((u) => u.id === userId);
    if (origem) setMapa(paraMapa(origem.permissoes));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Permissões — {user.name}</DialogTitle>
          <DialogDescription>
            Consultar: ver telas e baixar relatórios. Operar: também importar, processar e editar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Label>Copiar de outro usuário</Label>
            <Select value={null} onValueChange={(v) => v && copiarDe(v as string)} disabled={outros.length === 0}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={outros.length === 0 ? "nenhum disponível" : "Selecione"} />
              </SelectTrigger>
              <SelectContent>
                {outros.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Todas as rotinas</Label>
            <div className="flex gap-1.5">
              {(["nenhum", "consultar", "operar"] as const).map((n) => (
                <Button key={n} type="button" size="xs" variant="secondary" onClick={() => definirTodas(n)}>
                  {NIVEL_LABEL[n]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {MODULOS.map((m) => {
            const atual = mapa[m.chave] ?? "nenhum";
            return (
              <div key={m.chave} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="font-mono text-[12px] text-foreground">{m.nome}</span>
                <div className="flex gap-1">
                  {(["nenhum", "consultar", "operar"] as const).map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="xs"
                      variant={atual === n ? "default" : "secondary"}
                      aria-pressed={atual === n}
                      onClick={() => definir(m.chave, n)}
                    >
                      {NIVEL_LABEL[n]}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onSalvar(mapa)} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar permissões"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
