"use client";

import { createContext, useContext } from "react";
import { atende, type MapaPermissoes, type Modulo } from "@/lib/permissoes";

// Só controla o que aparece na tela (esconder botões de importar/editar).
// A proteção de verdade fica no servidor, em requirePermissao.
const PermissoesContext = createContext<MapaPermissoes>({});

export function PermissoesProvider({
  permissoes,
  children,
}: {
  permissoes: MapaPermissoes;
  children: React.ReactNode;
}) {
  return <PermissoesContext.Provider value={permissoes}>{children}</PermissoesContext.Provider>;
}

export function usePodeOperar(modulo: Modulo) {
  return atende(useContext(PermissoesContext)[modulo], "operar");
}
