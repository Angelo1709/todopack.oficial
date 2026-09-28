import "server-only"
import { db } from "@/lib/db"
import { products, systemArticles } from "@/lib/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import { parsePresentation, presentationLabel } from "@/lib/pack"
import { normalizeTiers, type Tier } from "@/lib/pricing"
import { getSyncConfig } from "@/lib/settings"
import { hasStock } from "@/lib/stock-sync"

// Un artículo = productos activos con el mismo group_key (sus presentaciones = tramos de precio).
// Un producto sin group_key es un artículo solo.
export const articleKey = sql<string>`coalesce(${products.groupKey}, 'id:' || ${products.id})`

type ArticleRow = {
  id: number
  name: string
  price: number
  category: string
  imageUrl: string | null
  packSize: number
  key: string
  /** Stock que informa el sistema del local (null = producto sin vincular). */
  stock: number | null
}

export type Article = {
  key: string
  /** Producto de la presentación más chica: identifica al artículo en el carrito. */
  baseId: number
  name: string
  category: string
  imageUrl: string | null
  /**
   * Presentaciones de menor a mayor (ver lib/pricing.ts). Con el stock activo en la tienda son sólo las
   * que tienen stock; si no queda ninguna, todas (para mostrar precios) y `available` es false.
   */
  tiers: Tier[]
  /** Se puede comprar. Sólo es false con el stock activo en la tienda y sin stock en ninguna presentación. */
  available: boolean
}

const articleColumns = {
  id: products.id,
  name: products.name,
  price: products.price,
  category: products.category,
  imageUrl: products.imageUrl,
  packSize: products.packSize,
  key: articleKey,
  stock: systemArticles.stock,
}

function toTiers(rows: ArticleRow[]): Tier[] {
  return normalizeTiers(
    rows.map((r) => ({
      productId: r.id,
      name: r.name,
      label: presentationLabel(r.name, r.packSize),
      packSize: r.packSize,
      price: r.price,
    })),
  )
}

function buildArticle(key: string, rows: ArticleRow[], enforceStock: boolean): Article | null {
  const allTiers = toTiers(rows)
  if (!allTiers.length) return null
  // El producto base (identidad en el carrito) no cambia con el stock: es la presentación más chica.
  const base = rows.find((r) => r.id === allTiers[0].productId)!
  const inStock = enforceStock ? toTiers(rows.filter((r) => hasStock(r.stock))) : allTiers
  const available = inStock.length > 0
  // El nombre va sin "PACK X6" solo si lo que dice coincide con el pack guardado (uno sin clasificar
  // tiene pack_size 1 aunque diga "CAJA X12": ahí se muestra el nombre completo).
  const parsed = parsePresentation(base.name)
  return {
    key,
    baseId: base.id,
    name: parsed.packSize === base.packSize ? parsed.baseName : base.name,
    category: base.category,
    imageUrl: rows.find((r) => r.imageUrl)?.imageUrl ?? null,
    tiers: available ? inStock : allTiers,
    available,
  }
}

/** Artículos (con todas sus presentaciones activas) para las claves pedidas, en el mismo orden. */
export async function loadArticles(keys: string[]): Promise<Article[]> {
  if (!keys.length) return []
  const [rows, { stockInStore }] = await Promise.all([
    db
      .select(articleColumns)
      .from(products)
      .leftJoin(systemArticles, eq(systemArticles.productId, products.id))
      .where(and(eq(products.active, true), inArray(articleKey, keys))),
    getSyncConfig(),
  ])
  const byKey = new Map<string, ArticleRow[]>()
  for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), row])
  return keys.flatMap((k) => {
    const article = byKey.has(k) ? buildArticle(k, byKey.get(k)!, stockInStore) : null
    return article ? [article] : []
  })
}

/** Para cada id de producto (activo), el artículo al que pertenece. Los inactivos o inexistentes no aparecen. */
export async function loadArticlesForProducts(ids: number[]): Promise<Map<number, Article>> {
  if (!ids.length) return new Map()
  const rows = await db
    .select({ id: products.id, key: articleKey })
    .from(products)
    .where(and(eq(products.active, true), inArray(products.id, ids)))
  const articles = await loadArticles([...new Set(rows.map((r) => r.key))])
  const byKey = new Map(articles.map((a) => [a.key, a]))
  const result = new Map<number, Article>()
  for (const r of rows) {
    const article = byKey.get(r.key)
    if (article) result.set(r.id, article)
  }
  return result
}
