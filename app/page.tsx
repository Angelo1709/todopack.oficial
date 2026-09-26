import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { and, asc, count, eq, ilike } from "drizzle-orm"
import { SiteHeader } from "@/components/site-header"
import { Storefront } from "@/components/storefront/storefront"
import { CATEGORY_ORDER } from "@/lib/categorize"

export const dynamic = "force-dynamic"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string }>
}) {
  const params = await searchParams
  const pageSize = 24
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1)
  const query = params.q?.trim() ?? ""
  const category = params.category?.trim() ?? "Todos"
  const filters = [
    eq(products.active, true),
    ...(query ? [ilike(products.name, `%${query}%`)] : []),
    ...(category !== "Todos" ? [eq(products.category, category)] : []),
  ]
  const where = and(...filters)
  const [rows, [{ total }], categoryRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        category: products.category,
        imageUrl: products.imageUrl,
      })
      .from(products)
      .where(where)
      .orderBy(asc(products.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(products).where(where),
    db.select({ category: products.category }).from(products).where(eq(products.active, true)),
  ])

  const totalProducts = Number(total)
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize))
  const safePage = Math.min(page, totalPages)
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
        products={rows}
        categories={categories}
        page={safePage}
        totalPages={totalPages}
        totalProducts={totalProducts}
        query={query}
        selectedCategory={category}
      />
    </main>
  )
}
