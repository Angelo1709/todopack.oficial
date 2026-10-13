import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { and, eq, ilike, sql } from "drizzle-orm"
import { SiteHeader } from "@/components/site-header"
import { Storefront } from "@/components/storefront/storefront"
import { CATEGORY_ORDER } from "@/lib/categorize"
import { Banknote, Tags, Truck } from "lucide-react"
import { articleKey, availableColumn, loadArticles, storefrontCondition } from "@/lib/catalog"
import { isSortOption } from "@/lib/sort-options"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 24

const BENEFITS = [
  { icon: Truck, title: "Entrega a domicilio", text: "Elegí el día y la franja horaria." },
  { icon: Tags, title: "Precio mayorista", text: "Llevando por pack o caja pagás menos." },
  { icon: Banknote, title: "Pagá como quieras", text: "Efectivo al recibir o transferencia." },
]

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string; orden?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1)
  const query = params.q?.trim().slice(0, 100) ?? ""
  const category = params.category?.trim() ?? "Todos"
  const sort = isSortOption(params.orden) ? params.orden : "nombre"
  // Activos, con foto y con stock conocido: lo agotado se muestra en gris al final.
  const visible = storefrontCondition()
  const where = and(
    visible,
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
          .orderBy(sql`bool_or(${availableColumn()}) desc`, order, sql`min(${products.name})`, articleKey)
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
      {!query && category === "Todos" && safePage === 1 && (
        <>
          <section className="border-b border-border bg-sidebar text-sidebar-foreground">
            <div className="mx-auto max-w-7xl px-4 py-8">
              <h1 className="font-serif text-3xl font-bold sm:text-4xl">
                Distribuidora <span className="text-primary">TodoPack Alcorta</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-sidebar-foreground/70">
                Bebidas, almacén, limpieza y packaging. Elegí tus productos, sumá al carrito y coordiná la
                entrega. Ventas por mayor y menor.
              </p>
            </div>
          </section>
          <section className="border-b border-border bg-card" aria-label="Cómo comprar">
            <ul className="mx-auto grid max-w-7xl gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-3">
              {BENEFITS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-sm leading-tight">
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-muted-foreground">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
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
      />
    </main>
  )
}
