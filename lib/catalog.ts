import "server-only"
import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import { parsePresentation, presentationLabel } from "@/lib/pack"
import { normalizeTiers, type Tier } from "@/lib/pricing"
import { stockAvailableCondition, stockVisibleCondition } from "@/lib/stock-availability"

// Un artículo = productos activos con el mismo group_key (sus presentaciones = tramos de precio).
// Un producto sin group_key es un artículo solo.
export const articleKey = sql<string>`coalesce(${products.groupKey}, 'id:' || ${products.id})`

/** La tienda sólo publica artículos con foto: alcanza con que la tenga una de sus presentaciones activas. */
export const articleHasPhoto = sql`exists (select 1 from products photo where photo.active and photo.image_url <> ''
  and coalesce(photo.group_key, 'id:' || photo.id) = ${articleKey})`

/** Filas que la tienda muestra: activas, con foto y con stock conocido (disponible o agotado). */
export function storefrontCondition() {
  return and(eq(products.active, true), stockVisibleCondition(), articleHasPhoto)
}

/** true si la presentación se puede vender ahora. */
export function availableColumn() {
  return sql<boolean>`coalesce(${stockAvailableCondition()}, false)`
}

/** El filtro y el orden consideran la misma oferta que puede mostrarse y comprarse. */
export function offerArticleCondition() {
  const keys = db.select({ key: articleKey }).from(products).where(and(
    storefrontCondition(), availableColumn(), sql`${products.price} > 0`,
    sql`${products.offer}->>'active' = 'true'`,
  ))
  return sql<boolean>`${articleKey} in (${keys})`
}

type ArticleRow = {
  id: number
  name: string
  price: number
  category: string
  imageUrl: string | null
  packSize: number
  key: string
  offer: import("./offers").Offer | null
  available: boolean
}

export type Article = {
  key: string
  /** Producto de la presentación más chica: identifica al artículo en el carrito. */
  baseId: number
  name: string
  category: string
  imageUrl: string | null
  /** Presentaciones de menor a mayor (ver lib/pricing.ts). Con stock, sólo las disponibles. */
  tiers: Tier[]
  /** false = agotado: se muestra en gris con sus precios, pero no se puede pedir. */
  available: boolean
}

const articleColumns = () => ({
  id: products.id,
  name: products.name,
  price: products.price,
  category: products.category,
  imageUrl: products.imageUrl,
  packSize: products.packSize,
  key: articleKey,
  offer: products.offer,
  available: availableColumn(),
})

function buildArticle(key: string, rows: ArticleRow[]): Article | null {
  // Una presentación agotada no participa del precio por tramos mientras quede otra con stock.
  const inStock = rows.filter((r) => r.available)
  const tiers = normalizeTiers(
    (inStock.length ? inStock : rows).map((r) => ({
      productId: r.id,
      name: r.name,
      label: presentationLabel(r.name, r.packSize),
      packSize: r.packSize,
      price: r.price,
      offer: r.offer,
    })),
  )
  if (!tiers.length) return null
  const base = rows.find((r) => r.id === tiers[0].productId)!
  // El nombre va sin "PACK X6" solo si lo que dice coincide con el pack guardado (uno sin clasificar
  // tiene pack_size 1 aunque diga "CAJA X12": ahí se muestra el nombre completo).
  const parsed = parsePresentation(base.name)
  const display = rows.map(r=>parsePresentation(r.name)).find(p=>p.groupKey===key) ?? parsed
  return {
    key,
    baseId: base.id,
    name: parsed.packSize === base.packSize ? display.baseName : base.name,
    category: base.category,
    imageUrl: rows.find((r) => r.imageUrl)?.imageUrl ?? null,
    tiers,
    available: inStock.length > 0,
  }
}

/** Artículos que muestra la tienda (disponibles y agotados) para las claves pedidas, en el mismo orden. */
export async function loadArticles(keys: string[]): Promise<Article[]> {
  if (!keys.length) return []
  const rows = await db
    .select(articleColumns())
    .from(products)
    .where(and(storefrontCondition(), inArray(articleKey, keys)))
  const byKey = new Map<string, ArticleRow[]>()
  for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), row])
  return keys.flatMap((k) => {
    const article = byKey.has(k) ? buildArticle(k, byKey.get(k)!) : null
    return article ? [article] : []
  })
}

/** Para cada id de producto, el artículo al que pertenece si hoy se puede pedir. Inactivos, agotados, sin foto o inexistentes no aparecen. */
export async function loadArticlesForProducts(ids: number[]): Promise<Map<number, Article>> {
  if (!ids.length) return new Map()
  const rows = await db
    .select({ id: products.id, key: articleKey })
    .from(products)
    .where(and(eq(products.active, true), inArray(products.id, ids)))
  const articles = await loadArticles([...new Set(rows.map((r) => r.key))])
  const byKey = new Map(articles.filter((a) => a.available).map((a) => [a.key, a]))
  const result = new Map<number, Article>()
  for (const r of rows) {
    const article = byKey.get(r.key)
    if (article) result.set(r.id, article)
  }
  return result
}
