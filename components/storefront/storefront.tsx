"use client"

import { useEffect, useRef, useTransition } from "react"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useCart } from "@/components/cart/cart-provider"
import { CartSheet } from "@/components/cart/cart-sheet"
import { ProductCard, type StoreArticle } from "@/components/storefront/product-card"
import { Button } from "@/components/ui/button"
import { categoryImage } from "@/lib/categories"
import { formatPrice } from "@/lib/format"
import { SORT_OPTIONS, type SortOption } from "@/lib/sort-options"
import { ArrowDownUp, ChevronLeft, ChevronRight, Flame, PackageSearch, ShoppingCart, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { EVENTS, track } from "@/lib/analytics"

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
  offersOnly,
}: {
  articles: StoreArticle[]
  categories: string[]
  page: number
  totalPages: number
  totalArticles: number
  query: string
  selectedCategory: string
  sort: SortOption
  offersOnly: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const { count, total } = useCart()
  const category = selectedCategory
  const tabs = ["Todos", ...categories]
  const isHome = category === "Todos" && !query && page === 1 && !offersOnly
  const featured = isHome ? articles.filter((article) => article.available && article.tiers.some((tier) => tier.offer?.active)).slice(0, 8) : []
  const featuredKeys = new Set(featured.map((article) => article.key))
  const remaining = articles.filter((article) => !featuredKeys.has(article.key))

  // Cada búsqueda con su cantidad de resultados: las de 0 son productos que la gente pide y no hay.
  const lastSearch = useRef("")
  useEffect(() => {
    const key = `${query}|${totalArticles}`
    if (!query || lastSearch.current === key) return
    lastSearch.current = key
    track(EVENTS.productsSearched, { query: query.toLowerCase(), results: totalArticles })
  }, [query, totalArticles])

  function navigate(next: { page?: number; q?: string; category?: string; sort?: SortOption; offers?: boolean }) {
    if (next.category && next.category !== category && next.category !== "Todos") {
      track(EVENTS.categorySelected, { category: next.category })
    }
    if (next.offers && !offersOnly) track(EVENTS.offersViewed)
    const params = new URLSearchParams()
    const nextQuery = next.q ?? query
    const nextCategory = next.category ?? category
    const nextSort = next.sort ?? sort
    const nextPage = next.page ?? 1
    if (next.offers ?? offersOnly) params.set("offers", "1")
    if (nextQuery.trim()) params.set("q", nextQuery.trim())
    if (nextCategory !== "Todos") params.set("category", nextCategory)
    if (nextSort !== "nombre") params.set("orden", nextSort)
    if (nextPage > 1) params.set("page", String(nextPage))
    const search = params.toString()
    startTransition(() => router.push(search ? `${pathname}?${search}` : pathname))
  }

  const heading = offersOnly
    ? `Ofertas${category === "Todos" ? "" : ` · ${category}`}`
    : query
      ? `Resultados para “${query}”`
      : category === "Todos"
        ? featured.length
          ? "Más productos"
          : "Todos los productos"
        : category
  const listed = totalArticles - featured.length

  return (
    <div className={cn("mx-auto max-w-7xl px-4 pb-8 pt-5 sm:pt-8", count > 0 && "pb-28 sm:pb-8")}>
      {isHome && categories.length > 0 && (
        <section className="mb-7" aria-labelledby="categorias">
          <h2 id="categorias" className="mb-3 font-serif text-lg font-semibold sm:text-xl">
            Comprá por categoría
          </h2>
          <div className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:gap-3">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => navigate({ category: c })}
                className="group flex w-[76px] shrink-0 snap-start flex-col items-center gap-1.5 text-center sm:w-24"
              >
                <span className="relative block size-16 overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border transition group-hover:ring-2 group-hover:ring-primary sm:size-20">
                  <Image src={categoryImage(c)} alt="" fill sizes="80px" loading="eager" className="object-cover" />
                </span>
                <span className="line-clamp-2 text-xs font-medium leading-tight text-muted-foreground group-hover:text-foreground">
                  {c}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="mb-7" aria-labelledby="ofertas">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="ofertas" className="flex items-center gap-2 font-serif text-lg font-semibold sm:text-xl">
                <Flame aria-hidden="true" className="size-5 text-primary" /> Ofertas destacadas
              </h2>
              <p className="text-sm text-muted-foreground">Descuentos y promociones de hoy.</p>
            </div>
            <Button
              variant="ghost"
              onClick={() => navigate({ offers: true })}
              className="h-10 shrink-0 gap-1 rounded-full px-3 text-sm font-semibold"
            >
              Ver todas <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
          {/* En el celular se deslizan de costado; en pantallas grandes, grilla. */}
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5">
            {featured.map((article, i) => (
              <ProductCard
                key={article.key}
                article={article}
                priority={i < 4}
                className="w-[46%] shrink-0 snap-start sm:w-auto"
              />
            ))}
          </div>
        </section>
      )}

      <div className="sticky top-[7.5rem] z-30 -mx-4 mb-4 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur sm:top-16">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            aria-pressed={offersOnly}
            onClick={() => navigate({ offers: !offersOnly })}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors",
              offersOnly
                ? "border-primary bg-primary text-primary-foreground"
                : "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15",
            )}
          >
            <Flame aria-hidden="true" className="size-4" /> Ofertas
          </button>
          {tabs.map((t) => {
            const active = category === t && !offersOnly
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => navigate({ category: t, offers: t === "Todos" ? false : offersOnly })}
                className={cn(
                  "h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors",
                  active
                    ? "border-sidebar bg-sidebar text-sidebar-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      {(remaining.length > 0 || featured.length === 0) && (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-semibold wrap-anywhere sm:text-xl">{heading}</h2>
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground tabular-nums">
                <span>
                  {listed} producto{listed === 1 ? "" : "s"}
                  {query && category !== "Todos" ? ` en ${category}` : ""}
                </span>
                {query && (
                  <button
                    type="button"
                    onClick={() => navigate({ q: "" })}
                    className="inline-flex min-h-10 items-center gap-1 font-medium text-foreground underline underline-offset-4"
                  >
                    <X aria-hidden="true" className="size-3.5" /> Borrar búsqueda
                  </button>
                )}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowDownUp aria-hidden="true" className="size-4" />
              <span className="sr-only sm:not-sr-only">Ordenar por</span>
              <select
                value={sort}
                onChange={(e) => navigate({ sort: e.target.value as SortOption })}
                aria-label="Ordenar productos"
                className="h-10 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground shadow-card"
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
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-muted">
                <PackageSearch aria-hidden="true" className="size-7 text-muted-foreground" />
              </span>
              <p className="font-serif text-base font-semibold">No encontramos productos</p>
              <p className="max-w-xs text-sm text-muted-foreground">Probá con otra palabra o mirá todas las categorías.</p>
              {!isHome && (
                <Button
                  variant="outline"
                  className="mt-1 h-11 rounded-full px-5"
                  onClick={() => navigate({ q: "", category: "Todos", offers: false })}
                >
                  Ver todos los productos
                </Button>
              )}
            </div>
          ) : (
            <>
              <div
                aria-busy={pending}
                className={cn(
                  "grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5",
                  pending && "opacity-60",
                )}
              >
                {remaining.map((a, i) => (
                  // Sin ofertas arriba (búsqueda, categoría, página 2...), la grilla es lo primero que se ve.
                  <ProductCard key={a.key} article={a} priority={featured.length === 0 && i < 4} />
                ))}
              </div>
              {totalPages > 1 && (
                <nav className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Paginación">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigate({ page: page - 1 })}
                    disabled={page <= 1}
                    aria-label="Página anterior"
                    className="size-11 rounded-full"
                  >
                    <ChevronLeft aria-hidden="true" className="size-4" />
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
                        className="size-11 rounded-full font-semibold tabular-nums"
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
                    className="size-11 rounded-full"
                  >
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Button>
                </nav>
              )}
            </>
          )}
        </>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-safe sm:hidden">
          <CartSheet>
            <Button className="h-14 w-full justify-between gap-3 rounded-2xl px-4 text-base font-semibold shadow-raised">
              <span className="flex items-center gap-2.5">
                <span className="relative">
                  <ShoppingCart aria-hidden="true" className="size-5" />
                  <span className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-sidebar px-1 text-[10px] font-bold text-sidebar-foreground tabular-nums">
                    {count}
                  </span>
                </span>
                Ver carrito
              </span>
              <span className="font-serif font-bold tabular-nums">{formatPrice(total)}</span>
            </Button>
          </CartSheet>
        </div>
      )}
    </div>
  )
}
