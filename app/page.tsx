import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm"
import { SiteHeader } from "@/components/site-header"
import { Storefront } from "@/components/storefront/storefront"
import type { StoreArticle, StoreVariant } from "@/components/storefront/product-card"
import { CATEGORY_ORDER } from "@/lib/categorize"
import { packSavingsPercent, parsePresentation, presentationLabel, unitPrice } from "@/lib/pack"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 24

// Un artículo = productos con el mismo group_key (presentaciones); sin grupo, el producto va solo.
const articleKey = sql<string>`coalesce(${products.groupKey}, 'id:' || ${products.id})`

type VariantRow = {
  id: number
  name: string
  price: number
  category: string
  imageUrl: string | null
  packSize: number
  key: string
}

function buildArticle(key: string, rows: VariantRow[]): StoreArticle {
  const sorted = [...rows].sort((a, b) => a.packSize - b.packSize || a.price - b.price)
  const single = sorted.find((v) => v.packSize === 1)
  const variants: StoreVariant[] = sorted.map((v) => ({
    id: v.id,
    name: v.name,
    price: v.price,
    category: v.category,
    imageUrl: v.imageUrl,
    packSize: v.packSize,
    label: presentationLabel(v.name, v.packSize),
    unitPrice: unitPrice(v.price, v.packSize),
    savingsPercent: single && v.packSize > 1 ? packSavingsPercent(v.price, v.packSize, single.price) : 0,
  }))
  // Dos presentaciones con la misma etiqueta (grupo armado a mano): se distinguen por nombre.
  const labels = variants.map((v) => v.label)
  for (const v of variants) {
    if (labels.filter((l) => l === v.label).length > 1) v.label = parsePresentation(v.name).baseName
  }
  const first = sorted[0]
  // El nombre se muestra sin "PACK X6" solo si el pack de la base coincide con lo que dice el nombre
  // (un producto sin clasificar tiene pack_size 1 aunque diga "CAJA X12": ahí va el nombre completo).
  const parsed = parsePresentation(first.name)
  return {
    key,
    baseName: parsed.packSize === first.packSize ? parsed.baseName : first.name,
    category: first.category,
    imageUrl: sorted.find((v) => v.imageUrl)?.imageUrl ?? null,
    variants,
  }
}

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

  // ...y todas sus presentaciones activas.
  const variantRows: VariantRow[] = pageKeys.length
    ? await db
        .select({
          id: products.id,
          name: products.name,
          price: products.price,
          category: products.category,
          imageUrl: products.imageUrl,
          packSize: products.packSize,
          key: articleKey,
        })
        .from(products)
        .where(and(eq(products.active, true), inArray(articleKey, pageKeys)))
        .orderBy(asc(products.packSize), asc(products.price))
    : []

  const byKey = new Map<string, VariantRow[]>()
  for (const row of variantRows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), row])
  const articles = pageKeys.filter((k) => byKey.has(k)).map((k) => buildArticle(k, byKey.get(k)!))

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
