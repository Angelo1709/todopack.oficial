"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import type { CartItem } from "@/components/cart/cart-provider"
import { ProductCard } from "@/components/storefront/product-card"
import { Input } from "@/components/ui/input"
import { Search, PackageSearch } from "lucide-react"
import { cn } from "@/lib/utils"

type StoreProduct = Omit<CartItem, "quantity">

export function Storefront({
  products,
  categories,
  page,
  totalPages,
  totalProducts,
  query: initialQuery,
  selectedCategory,
}: {
  products: StoreProduct[]
  categories: string[]
  page: number
  totalPages: number
  totalProducts: number
  query: string
  selectedCategory: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState(initialQuery)
  const category = selectedCategory
  const tabs = ["Todos", ...categories]

  function navigate(next: { page?: number; q?: string; category?: string }) {
    const params = new URLSearchParams()
    const nextQuery = next.q ?? query
    const nextCategory = next.category ?? category
    const nextPage = next.page ?? 1
    if (nextQuery.trim()) params.set("q", nextQuery.trim())
    if (nextCategory !== "Todos") params.set("category", nextCategory)
    if (nextPage > 1) params.set("page", String(nextPage))
    router.push(`${pathname}?${params.toString()}`)
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate({ page: 1, q: query })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="sticky top-16 z-30 -mx-4 mb-5 bg-background/90 px-4 pb-3 pt-4 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <form onSubmit={submitSearch}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar productos, marcas..."
              className="h-11 pl-9"
              aria-label="Buscar productos"
            />
          </form>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => navigate({ page: 1, category: t })}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
                category === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-serif text-xl font-bold">
          {category === "Todos" ? "Todos los productos" : category}
        </h2>
        <span className="text-sm text-muted-foreground">{totalProducts} productos</span>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <PackageSearch className="size-10 opacity-40" />
          <p>No encontramos productos para tu búsqueda.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Paginación">
            <button
              type="button"
              onClick={() => navigate({ page: page - 1 })}
              disabled={page <= 1}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
            <button
              type="button"
              onClick={() => navigate({ page: page + 1 })}
              disabled={page >= totalPages}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
            >
              Siguiente
            </button>
          </nav>
          )}
        </>
      )}
    </div>
  )
}
