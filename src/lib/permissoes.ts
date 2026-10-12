// Catálogo de rotinas que podem ser liberadas para usuários não-admin.
// Arquivo compartilhado entre servidor e navegador (sem acesso ao banco).
// A tela de Usuários é exclusiva de admin e não entra aqui.

export const MODULOS = [
  { chave: "beneficios", nome: "Benefícios" },
  { chave: "banco-horas", nome: "Banco de Horas" },
  { chave: "folha", nome: "Análise da Folha" },
  { chave: "indicadores", nome: "Indicadores" },
  { chave: "importar", nome: "Central de Importações" },
  { chave: "ferias", nome: "Programação de Férias" },
  { chave: "funcionarios", nome: "Funcionários" },
  { chave: "terceiros", nome: "Terceiros" },
  { chave: "cargos", nome: "Cargos" },
  { chave: "empresas", nome: "Empresas" },
] as const;

export type Modulo = (typeof MODULOS)[number]["chave"];

// "operar" inclui "consultar".
export const NIVEIS = ["consultar", "operar"] as const;
export type Nivel = (typeof NIVEIS)[number];

export type MapaPermissoes = Partial<Record<Modulo, Nivel>>;

const CHAVES = new Set<string>(MODULOS.map((m) => m.chave));

export function isModulo(valor: string): valor is Modulo {
  return CHAVES.has(valor);
}

export function isNivel(valor: string): valor is Nivel {
  return (NIVEIS as readonly string[]).includes(valor);
}

export function atende(possui: Nivel | undefined, exigido: Nivel): boolean {
  if (!possui) return false;
  return exigido === "consultar" || possui === "operar";
}

// Mapa completo (tudo "operar") usado para admin.
export const MAPA_ADMIN: MapaPermissoes = Object.fromEntries(
  MODULOS.map((m) => [m.chave, "operar"]),
) as MapaPermissoes;
