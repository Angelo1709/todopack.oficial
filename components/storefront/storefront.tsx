"use client"

import { useTransition } from "react"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useCart } from "@/components/cart/cart-provider"
import { CartSheet } from "@/components/cart/cart-sheet"
import { ProductCard, type StoreArticle } from "@/components/storefront/product-card"
import { Button } from "@/components/ui/button"
import { categoryImage } from "@/lib/categories"
import { formatPrice } from "@/lib/format"
import { SORT_OPTIONS, type SortOption } from "@/lib/sort-options"
import { ChevronLeft, ChevronRight, PackageSearch, ShoppingCart, X } from "lucide-react"
import { cn } from "@/lib/utils"

/** Primera, última y las vecinas de la actual: 1 … 4 5 6 … 20. */
function pageList(page: number, total: number): (number | "gap")[] {
  const pages = [...new Set([1, page - 1, page, page + 1, total])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? ["gap" as const, p] : [p]))
}

export function Storefront({
  articles,
  categories,
  page,
  totalPages,
  totalArticles,
  query,
  selectedCategory,
  sort,
}: {
  articles: StoreArticle[]
  categories: string[]
  page: number
  totalPages: number
  totalArticles: number
  query: string
  selectedCategory: string
  sort: SortOption
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const { count, total } = useCart()
  const category = selectedCategory
  const tabs = ["Todos", ...categories]
  const isHome = category === "Todos" && !query && page === 1

  function navigate(next: { page?: number; q?: string; category?: string; sort?: SortOption }) {
    const params = new URLSearchParams()
    const nextQuery = next.q ?? query
    const nextCategory = next.category ?? category
    const nextSort = next.sort ?? sort
    const nextPage = next.page ?? 1
    if (nextQuery.trim()) params.set("q", nextQuery.trim())
    if (nextCategory !== "Todos") params.set("category", nextCategory)
    if (nextSort !== "nombre") params.set("orden", nextSort)
    if (nextPage > 1) params.set("page", String(nextPage))
    const search = params.toString()
    startTransition(() => router.push(search ? `${pathname}?${search}` : pathname))
  }

  return (
    <div className={cn("mx-auto max-w-7xl px-4 py-6", count > 0 && "pb-24 sm:pb-6")}>
      {isHome && categories.length > 0 && (
        <section className="mb-6" aria-label="Categorías">
          <h2 className="mb-3 font-serif text-xl font-bold">Comprá por categoría</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => navigate({ category: c })}
                className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center"
              >
                <span className="relative block size-16 overflow-hidden rounded-full border border-border bg-card transition-colors group-hover:border-primary">
                  <Image src={categoryImage(c)} alt="" fill sizes="64px" className="object-cover" />
                </span>
                <span className="text-xs leading-tight text-muted-foreground group-hover:text-foreground">{c}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="sticky top-28 z-30 -mx-4 mb-4 bg-background/90 px-4 py-3 backdrop-blur sm:top-16">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => navigate({ category: t })}
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

      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-bold wrap-anywhere">
            {query ? `Resultados para “${query}”` : category === "Todos" ? "Todos los productos" : category}
          </h2>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground tabular-nums">
            <span>
              {totalArticles} producto{totalArticles === 1 ? "" : "s"}
              {query && category !== "Todos" ? ` en ${category}` : ""}
            </span>
            {query && (
              <button
                type="button"
                onClick={() => navigate({ q: "" })}
                className="inline-flex items-center gap-1 underline hover:text-foreground"
              >
                <X className="size-3.5" /> Borrar búsqueda
              </button>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Ordenar por
          <select
            value={sort}
            onChange={(e) => navigate({ sort: e.target.value as SortOption })}
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <PackageSearch className="size-10 opacity-40" />
          <p>No encontramos productos para tu búsqueda.</p>
          {!isHome && (
            <Button variant="outline" className="mt-2" onClick={() => navigate({ q: "", category: "Todos" })}>
              Ver todos los productos
            </Button>
          )}
        </div>
      ) : (
        <>
          <div
            aria-busy={pending}
            className={cn(
              "grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
              pending && "opacity-60",
            )}
          >
            {articles.map((a) => (
              <ProductCard key={a.key} article={a} />
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-label="Paginación">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate({ page: page - 1 })}
                disabled={page <= 1}
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              {pageList(page, totalPages).map((p, i) =>
                p === "gap" ? (
                  <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="icon"
                    onClick={() => navigate({ page: p })}
                    aria-label={`Página ${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className="tabular-nums"
                  >
                    {p}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate({ page: page + 1 })}
                disabled={page >= totalPages}
                aria-label="Página siguiente"
              >
                <ChevronRight className="size-4" />
              </Button>
            </nav>
          )}
        </>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur sm:hidden">
          <CartSheet>
            <Button size="lg" className="w-full justify-between gap-2">
              <span className="flex items-center gap-2">
                <ShoppingCart className="size-4" /> Ver carrito · {count} artículo{count === 1 ? "" : "s"}
              </span>
              <span className="font-bold tabular-nums">{formatPrice(total)}</span>
            </Button>
          </CartSheet>
        </div>
      )}
    </div>
  )
}
