import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { and, eq, ilike, sql } from "drizzle-orm"
import { SiteHeader } from "@/components/site-header"
import { Storefront } from "@/components/storefront/storefront"
import { CATEGORY_ORDER } from "@/lib/categorize"
import { Banknote, Tags, Truck } from "lucide-react"
import { articleKey, availableColumn, loadArticles, offerArticleCondition, storefrontCondition } from "@/lib/catalog"
import { isSortOption } from "@/lib/sort-options"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 24

const BENEFITS = [
  { icon: Truck, title: "Entrega a domicilio" },
  { icon: Tags, title: "Precio mayorista por pack" },
  { icon: Banknote, title: "Efectivo o transferencia" },
]

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string; orden?: string; offers?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1)
  const query = params.q?.trim().slice(0, 100) ?? ""
  const category = params.category?.trim() ?? "Todos"
  const sort = isSortOption(params.orden) ? params.orden : "nombre"
  // Activos, con foto y con stock conocido: lo agotado se muestra en gris al final.
  const visible = storefrontCondition()
  const offersOnly = params.offers === "1"
  const where = and(
    visible,
    offersOnly ? offerArticleCondition() : undefined,
    query ? ilike(products.name, `%${query.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
    category !== "Todos" ? eq(products.category, category) : undefined,
  )

  // Conteo de artículos (no de filas) y categorías con productos visibles.
  const [[{ total }], categoryRows] = await Promise.all([
    db.select({ total: sql<number>`count(distinct ${articleKey})::int` }).from(products).where(where),
    db.selectDistinct({ category: products.category }).from(products).where(visible),
  ])
  const totalArticles = Number(total)
  const totalPages = Math.max(1, Math.ceil(totalArticles / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const unitPrice = sql`min(${products.price}::float8 / greatest(${products.packSize}, 1))`
  const order = sort === "menor-precio" ? sql`${unitPrice} asc` : sort === "mayor-precio" ? sql`${unitPrice} desc` : sql`min(${products.name})`

  // Página de artículos que cumplen el filtro (alguna presentación coincide)...
  const pageKeys = totalArticles
    ? (
        await db
          .select({ key: articleKey })
          .from(products)
          .where(where)
          .groupBy(articleKey)
          .orderBy(sql`bool_or(${offerArticleCondition()}) desc`, sql`bool_or(${availableColumn()}) desc`, order, sql`min(${products.name})`, articleKey)
          .limit(PAGE_SIZE)
          .offset((safePage - 1) * PAGE_SIZE)
      ).map((r) => r.key)
    : []

  // ...con todas sus presentaciones activas (tramos de precio).
  const articles = await loadArticles(pageKeys)

  const present = new Set(categoryRows.map((r) => r.category))
  const categories = CATEGORY_ORDER.filter((c) => present.has(c))

  return (
    <main className="min-h-dvh bg-background">
      <SiteHeader search query={query} />
      {/* La portada sólo en el inicio: buscando o filtrando se va directo a los productos. */}
      {!offersOnly && !query && category === "Todos" && safePage === 1 && (
        <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
          {/* Brillo ámbar decorativo, como el borde de la tapita del logo. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-primary/30 blur-3xl"
          />
          <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-5 sm:pb-12 sm:pt-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-primary">
              Distribuidora TodoPack Alcorta
            </p>
            <h1 className="mt-1.5 max-w-2xl font-serif text-[1.65rem] font-bold leading-tight sm:text-5xl">
              Bebidas, almacén y limpieza con <span className="text-sidebar-primary">precio mayorista</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-sidebar-foreground/75 sm:text-base">
              Armá tu pedido, elegí día y franja, y te lo llevamos. Ventas por mayor y menor.
            </p>
            <ul
              aria-label="Cómo comprar"
              className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:mt-6 sm:flex-wrap sm:px-0"
            >
              {BENEFITS.map(({ icon: Icon, title }) => (
                <li
                  key={title}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent px-3.5 py-2 text-xs font-semibold sm:text-sm"
                >
                  <Icon aria-hidden="true" className="size-4 text-sidebar-primary" />
                  {title}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <Storefront
        articles={articles}
        categories={categories}
        page={safePage}
        totalPages={totalPages}
        totalArticles={totalArticles}
        query={query}
        selectedCategory={category}
        sort={sort}
        offersOnly={offersOnly}
      />
    </main>
  )
}
