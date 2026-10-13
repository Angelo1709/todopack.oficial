// Orden del catálogo (parámetro `orden` de la URL). Lo agotado va siempre al final.
export const SORT_OPTIONS = [
  { value: "nombre", label: "Nombre (A-Z)" },
  { value: "menor-precio", label: "Menor precio" },
  { value: "mayor-precio", label: "Mayor precio" },
] as const

export type SortOption = (typeof SORT_OPTIONS)[number]["value"]

export function isSortOption(value: unknown): value is SortOption {
  return SORT_OPTIONS.some((o) => o.value === value)
}
