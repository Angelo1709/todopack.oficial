import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { and, eq, ilike, sql } from "drizzle-orm"
import { SiteHeader } from "@/components/site-header"
import { Storefront } from "@/components/storefront/storefront"
import { CATEGORY_ORDER } from "@/lib/categorize"
import { articleKey, loadArticles } from "@/lib/catalog"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 24

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1)
  const query = params.q?.trim().slice(0, 100) ?? ""
  const category = params.category?.trim() ?? "Todos"
  const where = and(
    eq(products.active, true),
    query ? ilike(products.name, `%${query.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
    category !== "Todos" ? eq(products.category, category) : undefined,
  )

  // Conteo de artículos (no de filas) y categorías con productos activos.
  const [[{ total }], categoryRows] = await Promise.all([
    db.select({ total: sql<number>`count(distinct ${articleKey})::int` }).from(products).where(where),
    db.selectDistinct({ category: products.category }).from(products).where(eq(products.active, true)),
  ])
  const totalArticles = Number(total)
  const totalPages = Math.max(1, Math.ceil(totalArticles / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  // Página de artículos que cumplen el filtro (alguna presentación coincide)...
  const pageKeys = totalArticles
    ? (
        await db
          .select({ key: articleKey })
          .from(products)
          .where(where)
          .groupBy(articleKey)
          .orderBy(sql`min(${products.name})`, articleKey)
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
      <SiteHeader />
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
      <Storefront
        articles={articles}
        categories={categories}
        page={safePage}
        totalPages={totalPages}
        totalArticles={totalArticles}
        query={query}
        selectedCategory={category}
      />
    </main>
  )
}
