"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CATEGORY_ORDER } from "@/lib/categorize"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search } from "lucide-react"

// Debe coincidir con los estados que acepta app/admin/productos/page.tsx.
const PRODUCT_STATUS_FILTERS = [
  { value: "activos", label: "Activos" },
  { value: "inactivos", label: "Inactivos" },
  { value: "sin-imagen", label: "Sin imagen" },
  { value: "todos", label: "Todos" },
] as const

export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number]["value"]

type Params = { q: string; categoria: string; estado: ProductStatusFilter }

const ALL = "todas"

export function ProductFilters({ q, categoria, estado, total }: Params & { total: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState(q)

  function navigate(next: Partial<Params>) {
    // Cambiar un filtro vuelve a la primera página.
    const merged: Params = { q: query, categoria, estado, ...next }
    const params = new URLSearchParams()
    if (merged.q.trim()) params.set("q", merged.q.trim())
    if (merged.categoria) params.set("categoria", merged.categoria)
    if (merged.estado !== "activos") params.set("estado", merged.estado)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            navigate({ q: query })
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre..."
            className="h-9 pl-9"
            aria-label="Buscar productos"
          />
        </form>
        <Select
          value={categoria || ALL}
          onValueChange={(v) => navigate({ categoria: !v || v === ALL ? "" : String(v) })}
        >
          <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Filtrar por categoría">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {CATEGORY_ORDER.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRODUCT_STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => navigate({ estado: f.value })}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
                estado === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {total} resultado{total === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  )
}

