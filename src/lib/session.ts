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

// Empresas liberadas para o usuário; null = todas (admin). Memoizado por requisição.
export const getEmpresasPermitidas = cache(async (userId: string, role: string): Promise<string[] | null> => {
  if (role === "admin") return null;
  const linhas = await prisma.userEmpresa.findMany({ where: { userId }, select: { empresaId: true } });
  return linhas.map((l) => l.empresaId);
});

type UsuarioEscopo = { id: string; role: string };

// Filtro de empresa para usar direto no `where` do Prisma, ex.: `{ empresaId: await escopoEmpresa(user) }`
// ou `{ id: await escopoEmpresa(user) }` na própria tabela de empresas. undefined = sem filtro (admin).
export async function escopoEmpresa(user: UsuarioEscopo): Promise<{ in: string[] } | undefined> {
  const ids = await getEmpresasPermitidas(user.id, user.role);
  return ids === null ? undefined : { in: ids };
}

// Junta o escopo do usuário com uma empresa escolhida num filtro da tela (opcional).
// Empresa fora do escopo = filtro que não encontra nada.
export function restringirEscopo(
  escopo: { in: string[] } | undefined,
  empresaId?: string | null,
): string | { in: string[] } | undefined {
  if (!empresaId) return escopo;
  if (!escopo || escopo.in.includes(empresaId)) return empresaId;
  return { in: [] };
}

export async function podeEmpresa(user: UsuarioEscopo, empresaId: string): Promise<boolean> {
  const ids = await getEmpresasPermitidas(user.id, user.role);
  return ids === null || ids.includes(empresaId);
}

// Mensagem padrão quando um arquivo/ação cai numa empresa não liberada.
export const MSG_EMPRESA_NAO_LIBERADA = "Você não tem acesso a essa empresa. Fale com um administrador.";

// Exige acesso à rotina. Vale para páginas e para ações do servidor:
// sem permissão, a pessoa é levada de volta ao painel.
export async function requirePermissao(modulo: Modulo, nivel: Nivel) {
  const user = await requireUser();
  const permissoes = await getPermissoes(user.id, user.role);
  if (!atende(permissoes[modulo], nivel)) redirect("/dashboard");
  return user;
}
