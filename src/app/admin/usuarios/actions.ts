"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { logAction } from "@/lib/audit";

const roleSchema = z.enum(["admin", "usuario"]);

const createUserSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  username: z
    .string()
    .min(3, "Mínimo de 3 caracteres")
    .regex(/^[a-zA-Z0-9_.]+$/, "Use apenas letras, números, ponto ou underline"),
  password: z.string().min(4, "Mínimo de 4 caracteres"),
  role: roleSchema,
});

export async function createUser(input: z.infer<typeof createUserSchema>) {
  const admin = await requireAdmin();
  const data = createUserSchema.parse(input);

  const existing = await prisma.user.findUnique({ where: { username: data.username } });
  if (existing) {
    return { error: "Já existe um usuário com esse nome de usuário." };
  }

  const result = await auth.api.signUpEmail({
    body: {
      name: data.name,
      email: `${data.username}@usuarios.local`,
      username: data.username,
      password: data.password,
    },
  });

  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: data.role },
  });

  await logAction(admin.id, "user.create", result.user.id, { username: data.username, role: data.role });

  revalidatePath("/admin/usuarios");
  return { error: null };
}

export async function updateUserRole(userId: string, role: "admin" | "usuario") {
  const admin = await requireAdmin();

  if (userId === admin.id) {
    return { error: "Você não pode alterar sua própria permissão." };
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAction(admin.id, "user.role_change", userId, { role });

  revalidatePath("/admin/usuarios");
  return { error: null };
}

const resetPasswordSchema = z.object({
  newPassword: z.string().min(4, "Mínimo de 4 caracteres"),
});

export async function resetUserPassword(userId: string, input: z.infer<typeof resetPasswordSchema>) {
  const admin = await requireAdmin();
  const { newPassword } = resetPasswordSchema.parse(input);

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });
  if (!account) {
    return { error: "Este usuário não possui login por senha." };
  }

  const hashed = await hashPassword(newPassword);
  await prisma.account.update({ where: { id: account.id }, data: { password: hashed } });
  await logAction(admin.id, "user.password_reset", userId);

  revalidatePath("/admin/usuarios");
  return { error: null };
}

export async function deleteUser(userId: string) {
  const admin = await requireAdmin();

  if (userId === admin.id) {
    return { error: "Você não pode excluir seu próprio usuário." };
  }

  await prisma.user.delete({ where: { id: userId } });
  await logAction(admin.id, "user.delete", userId);

  revalidatePath("/admin/usuarios");
  return { error: null };
}
