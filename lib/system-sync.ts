import "server-only"
import { createHash, timingSafeEqual } from "node:crypto"
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { products, stockSyncs, systemArticles } from "@/lib/db/schema"
import { finalPrice, matchByName, type SyncPayload } from "@/lib/stock-sync"

// Aplica en la base lo que manda el script de la PC del local (ver lib/stock-sync.ts y
// tools/sincronizador-pc/). La clave se guarda sólo como hash (settings.syncKeyHash).

export function hashSyncKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex")
}

/** Compara en tiempo constante la clave recibida contra el hash guardado. */
export function syncKeyMatches(provided: string, storedHash: string): boolean {
  if (!provided || !/^[0-9a-f]{64}$/.test(storedHash)) return false
  const a = Buffer.from(hashSyncKey(provided), "hex")
  const b = Buffer.from(storedHash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export type SyncSummary = {
  /** Artículos recibidos. */
  articles: number
  /** De esos, vinculados a un producto de la tienda. */
  linked: number
  /** Vinculados por nombre en esta sincronización. */
  newLinks: number
  /** Productos de la tienda a los que se les cambió el precio. */
  pricesUpdated: number
  /** Productos activos de la tienda sin vincular (sin datos del sistema). */
  unlinkedProducts: number
  dryRun: boolean
}

/** Se tira dentro de la transacción para deshacer todo en el modo prueba. */
class DryRunRollback extends Error {
  constructor(readonly summary: SyncSummary) {
    super("modo prueba")
  }
}

// Dos sincronizaciones a la vez (la tarea se superpone, o alguien corre la prueba) se esperan.
const LOCK_ID = 73_312_026
const CHUNK = 500

/**
 * Guarda la copia de los artículos del sistema, vincula por nombre los que todavía no tienen producto y,
 * si `pricesFromSystem`, actualiza el precio de los productos vinculados. Todo en una transacción; con
 * `dryRun` se calcula el resultado y se deshace.
 */
export async function applySync(
  payload: SyncPayload,
  { dryRun, pricesFromSystem }: { dryRun: boolean; pricesFromSystem: boolean },
): Promise<SyncSummary> {
  const now = new Date()
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_ID})`)

      const rows = payload.articulos.map((a) => ({
        systemId: a.id,
        code: a.codigo,
        name: a.nombre,
        netPrice: a.precioNeto,
        iva: a.iva,
        price: finalPrice(a.precioNeto, a.iva),
        stock: a.stock,
        seenAt: now,
        updatedAt: now,
      }))
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx
          .insert(systemArticles)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: systemArticles.systemId,
            set: {
              code: sql`excluded.code`,
              name: sql`excluded.name`,
              netPrice: sql`excluded.net_price`,
              iva: sql`excluded.iva`,
              price: sql`excluded.price`,
              stock: sql`excluded.stock`,
              seenAt: sql`excluded.seen_at`,
              updatedAt: sql`excluded.updated_at`,
            },
          })
      }

      // Vínculos por nombre: artículos de este envío sin producto (y que el admin no desvinculó) <->
      // productos activos sin artículo.
      const unlinked = await tx
        .select({ systemId: systemArticles.systemId, name: systemArticles.name })
        .from(systemArticles)
        .where(
          and(isNull(systemArticles.productId), isNull(systemArticles.linkSource), eq(systemArticles.seenAt, now)),
        )
      const freeProducts = await tx
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(
          and(
            eq(products.active, true),
            sql`not exists (select 1 from ${systemArticles} s where s.product_id = ${products.id})`,
          ),
        )
      const pairs = matchByName(unlinked, freeProducts)
      for (const pair of pairs) {
        await tx
          .update(systemArticles)
          .set({ productId: pair.productId, linkSource: "nombre" })
          .where(eq(systemArticles.systemId, pair.systemId))
      }

      let pricesUpdated = 0
      if (pricesFromSystem) {
        // Precio 0 en el sistema = sin cargar: no se pisa el de la tienda.
        const result = await tx.execute(sql`
          UPDATE ${products} p SET price = s.price, updated_at = ${now}
          FROM ${systemArticles} s
          WHERE s.product_id = p.id AND s.seen_at = ${now} AND s.price > 0 AND p.price <> s.price`)
        pricesUpdated = result.rowCount ?? 0
      }

      const [{ linked }] = await tx
        .select({ linked: sql<number>`count(*)::int` })
        .from(systemArticles)
        .where(and(isNotNull(systemArticles.productId), eq(systemArticles.seenAt, now)))
      const [{ unlinkedProducts }] = await tx
        .select({ unlinkedProducts: sql<number>`count(*)::int` })
        .from(products)
        .where(
          and(
            eq(products.active, true),
            sql`not exists (select 1 from ${systemArticles} s where s.product_id = ${products.id})`,
          ),
        )

      const summary: SyncSummary = {
        articles: rows.length,
        linked,
        newLinks: pairs.length,
        pricesUpdated,
        unlinkedProducts,
        dryRun,
      }
      if (dryRun) throw new DryRunRollback(summary)

      await tx.insert(stockSyncs).values({
        receivedAt: now,
        source: payload.equipo,
        articles: summary.articles,
        linked: summary.linked,
        newLinks: summary.newLinks,
        pricesUpdated: summary.pricesUpdated,
      })
      return summary
    })
  } catch (err) {
    if (err instanceof DryRunRollback) return err.summary
    throw err
  }
}
