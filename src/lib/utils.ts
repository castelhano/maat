import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Sugestão padrão de nome curto de empresa pra gráficos/resumos: primeira palavra do nome/razão
// social (ex.: "PANTANAL TRANSP E SERVICOS..." -> "Pantanal").
export function primeiraPalavra(nome: string): string {
  const palavra = nome.trim().split(/\s+/)[0] ?? "";
  return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}
