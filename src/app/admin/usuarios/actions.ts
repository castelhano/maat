"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { logAction } from "@/lib/audit";

const roleSchema = z.enum(["admin", "usuario"]);

const createUserSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(4, "Mínimo de 4 caracteres"),
  role: roleSchema,
});

export async function createUser(input: z.infer<typeof createUserSchema>) {
  const admin = await requireAdmin();
  const data = createUserSchema.parse(input);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return { error: "Já existe um usuário com esse e-mail." };
  }

  const result = await auth.api.signUpEmail({
    body: { name: data.name, email: data.email, password: data.password },
  });

  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: data.role },
  });

  await logAction(admin.id, "user.create", result.user.id, { email: data.email, role: data.role });

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
