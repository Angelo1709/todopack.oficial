import { createHash, timingSafeEqual } from "node:crypto"
import type { PoolClient } from "pg"

export const MAX_SNAPSHOT_BYTES = 4_000_000
export const MAX_STOCK_ITEMS = 10_000
export const MAX_STOCK_PRICE = 100_000_000

/** `price`: precio final de la presentación (con IVA) en pesos enteros; null si el origen no lo envía o es cero. */
export type StockItem = { articleId: number; code: string; name: string; quantity: number; price: number | null }
export type StockSnapshot = {
  version: 1
  sourceId: string
  snapshotId: string
  capturedAt: string
  rowCount: number
  items: StockItem[]
}

export class StockSyncError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

// Conserva acentos y presentación. Nunca vincular por parecido ni por group_key.
export function stockNameKey(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase()
}

export function authorizedStockRequest(header: string | null, secret: string): boolean {
  if (secret.length < 32 || !header?.startsWith("Bearer ") || header.length > 1024) return false
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(header.slice(7)), digest(secret))
}

export function validateStockSnapshot(value: unknown, sourceId: string, now = Date.now()): StockSnapshot {
  if (!value || typeof value !== "object") throw new StockSyncError("Snapshot inválido")
  const v = value as Record<string, unknown>
  if (v.version !== 1 || v.sourceId !== sourceId) throw new StockSyncError("Origen o versión incorrectos")
  if (typeof v.snapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.snapshotId)) {
    throw new StockSyncError("Identificador de snapshot inválido")
  }
  if (typeof v.capturedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(v.capturedAt) || !Number.isFinite(Date.parse(v.capturedAt))) {
    throw new StockSyncError("Fecha de captura inválida")
  }
  if (Date.parse(v.capturedAt) > now + 300_000) throw new StockSyncError("Revisá el reloj de la PC: la captura está en el futuro")
  if (!Array.isArray(v.items) || v.items.length < 1 || v.items.length > MAX_STOCK_ITEMS || v.rowCount !== v.items.length) {
    throw new StockSyncError("Inventario vacío, incompleto o demasiado grande")
  }
  const seen = new Set<number>()
  const items: StockItem[] = v.items.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new StockSyncError("Artículo inválido")
    const item = raw as Record<string, unknown>
    if (typeof item.articleId !== "number" || !Number.isSafeInteger(item.articleId) || item.articleId < 1 || item.articleId > 2147483647 || seen.has(item.articleId)) {
      throw new StockSyncError("Id de artículo inválido o duplicado")
    }
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 500 || typeof item.code !== "string" || item.code.length > 100) {
      throw new StockSyncError("Nombre o código inválido")
    }
    if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || Math.abs(item.quantity) > 1_000_000_000) {
      throw new StockSyncError("Stock inválido; no se aceptan cantidades desconocidas")
    }
    // Las versiones anteriores del sincronizador no envían precio: se conserva el de la web.
    if (item.price !== undefined && item.price !== null && (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0 || item.price > MAX_STOCK_PRICE)) {
      throw new StockSyncError("Precio inválido")
    }
    const price = typeof item.price === "number" ? Math.round(item.price) : 0
    seen.add(item.articleId)
    return { articleId: item.articleId, code: item.code.trim(), name: item.name.trim(), quantity: item.quantity, price: price > 0 ? price : null }
  })
  return { version: 1, sourceId, snapshotId: v.snapshotId, capturedAt: v.capturedAt, rowCount: items.length, items }
}

/** El caller abre una transacción. Todo el snapshot se publica o se revierte junto. */
export async function applyStockSnapshot(client: Pick<PoolClient, "query">, snapshot: StockSnapshot) {
  // Mismo lock que la edición del catálogo; serializa también dos sincronizaciones.
  await client.query("SELECT pg_advisory_xact_lock(9137301)")
  const previous = (await client.query("SELECT * FROM stock_sync_state WHERE id=1 FOR UPDATE")).rows[0]
  if (previous && previous.source_id !== snapshot.sourceId) throw new StockSyncError("La base ya recibe otro origen de stock", 409)
  if (previous?.snapshot_id === snapshot.snapshotId) {
    const unmatched = Number((await client.query("SELECT count(*)::int AS n FROM products WHERE active AND stock_quantity IS NULL")).rows[0].n)
    return { applied: false, duplicate: true, received: previous.item_count, matched: previous.matched_products, unmatched, pricesUpdated: 0 }
  }
  if (previous && Date.parse(snapshot.capturedAt) <= new Date(previous.captured_at).getTime()) {
    throw new StockSyncError("La captura es anterior al último stock recibido", 409)
  }

  const records = snapshot.items.map(i => ({ ...i, nameKey: stockNameKey(i.name) }))
  await client.query(`INSERT INTO gestion_stock(article_id,code,name,name_key,quantity,price,snapshot_id)
    SELECT x."articleId",x.code,x.name,x."nameKey",x.quantity,x.price,$2::uuid
    FROM jsonb_to_recordset($1::jsonb) AS x("articleId" integer,code text,name text,"nameKey" text,quantity double precision,price integer)
    ON CONFLICT(article_id) DO UPDATE SET code=excluded.code,name=excluded.name,name_key=excluded.name_key,
      quantity=excluded.quantity,price=coalesce(excluded.price,gestion_stock.price),snapshot_id=excluded.snapshot_id,updated_at=now()`, [JSON.stringify(records), snapshot.snapshotId])
  // Una baja en Gestión también deja de estar disponible en la web.
  await client.query("UPDATE gestion_stock SET quantity=0,updated_at=now() WHERE snapshot_id<>$1::uuid", [snapshot.snapshotId])

  const productRows = (await client.query("SELECT id,name,gestion_article_id FROM products")).rows
  const sourceByName = new Map<string, StockItem[]>()
  const productsByName = new Map<string, number[]>()
  for (const item of snapshot.items) {
    const key = stockNameKey(item.name)
    sourceByName.set(key, [...(sourceByName.get(key) ?? []), item])
  }
  for (const product of productRows) {
    const key = stockNameKey(product.name)
    productsByName.set(key, [...(productsByName.get(key) ?? []), product.id])
  }
  const links: { productId: number; articleId: number }[] = []
  for (const product of productRows) {
    const key = stockNameKey(product.name), matches = sourceByName.get(key)
    // El vínculo por id permanece estable aunque cambie el nombre. Ambigüedades quedan para revisión.
    if (product.gestion_article_id === null && matches?.length === 1 && productsByName.get(key)?.length === 1) {
      links.push({ productId: product.id, articleId: matches[0].articleId })
    }
  }
  if (links.length) await client.query(`UPDATE products p SET gestion_article_id=x."articleId"
    FROM jsonb_to_recordset($1::jsonb) AS x("productId" integer,"articleId" integer)
    WHERE p.id=x."productId" AND p.gestion_article_id IS NULL`, [JSON.stringify(links)])
  await client.query(`UPDATE products p SET stock_quantity=s.quantity,stock_updated_at=now()
    FROM gestion_stock s WHERE p.gestion_article_id=s.article_id`)
  // Gestión manda en el precio de lo vinculado. Sin precio en el origen (o cero) se conserva el de la web.
  const pricesUpdated = (await client.query(`UPDATE products p SET price=s.price,updated_at=now()
    FROM gestion_stock s WHERE p.gestion_article_id=s.article_id AND s.snapshot_id=$1::uuid
      AND s.price>0 AND p.price<>s.price`, [snapshot.snapshotId])).rowCount ?? 0
  const matched = Number((await client.query("SELECT count(*)::int AS n FROM products WHERE gestion_article_id IS NOT NULL AND stock_quantity IS NOT NULL")).rows[0].n)
  const unmatched = Number((await client.query("SELECT count(*)::int AS n FROM products WHERE active AND stock_quantity IS NULL")).rows[0].n)
  await client.query(`INSERT INTO stock_sync_state(id,source_id,snapshot_id,captured_at,item_count,matched_products)
    VALUES(1,$1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,snapshot_id=excluded.snapshot_id,
    captured_at=excluded.captured_at,received_at=now(),item_count=excluded.item_count,matched_products=excluded.matched_products`,
    [snapshot.sourceId, snapshot.snapshotId, snapshot.capturedAt, snapshot.rowCount, matched])
  return { applied: true, duplicate: false, received: snapshot.rowCount, matched, unmatched, pricesUpdated }
}
