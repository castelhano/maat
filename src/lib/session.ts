import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MAPA_ADMIN,
  atende,
  isModulo,
  isNivel,
  type MapaPermissoes,
  type Modulo,
  type Nivel,
} from "@/lib/permissoes";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

// Usuário logado e ativo, sem exigir a troca de senha pendente
// (usado pela própria tela de troca de senha).
export async function requireUserSemTrocaSenha() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.user.ativo) redirect("/login");
  return session.user;
}

export async function requireUser() {
  const user = await requireUserSemTrocaSenha();
  if (user.trocarSenha) redirect("/trocar-senha");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

// Memoizado por requisição: layout, página e menu consultam sem repetir a busca.
export const getPermissoes = cache(async (userId: string, role: string): Promise<MapaPermissoes> => {
  if (role === "admin") return MAPA_ADMIN;
  const linhas = await prisma.userPermissao.findMany({ where: { userId } });
  const mapa: MapaPermissoes = {};
  for (const l of linhas) {
    if (isModulo(l.modulo) && isNivel(l.nivel)) mapa[l.modulo] = l.nivel;
  }
  return mapa;
});

// Exige acesso à rotina. Vale para páginas e para ações do servidor:
// sem permissão, a pessoa é levada de volta ao painel.
export async function requirePermissao(modulo: Modulo, nivel: Nivel) {
  const user = await requireUser();
  const permissoes = await getPermissoes(user.id, user.role);
  if (!atende(permissoes[modulo], nivel)) redirect("/dashboard");
  return user;
}
