"use server"

import { randomBytes } from "node:crypto"
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { products, settings, systemArticles } from "@/lib/db/schema"
import { requireAdmin, requireSuperadmin } from "@/lib/session"
import { getSyncConfig, type SyncSettingKey } from "@/lib/settings"
import { hashSyncKey } from "@/lib/system-sync"

// Pantalla /admin/sistema: sincronización con el sistema de gestión del local.

export type SistemaResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const NOT_ADMIN = "Tu sesión no tiene permisos de administrador. Volvé a ingresar."

async function saveSettings(values: Partial<Record<SyncSettingKey, string>>) {
  const now = new Date()
  const rows = Object.entries(values).map(([key, value]) => ({ key, value: value!, updatedAt: now }))
  if (!rows.length) return
  await db
    .insert(settings)
    .values(rows)
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: now } })
}

function revalidateStore() {
  revalidatePath("/admin/sistema")
  revalidatePath("/admin/productos")
  revalidatePath("/")
}

/**
 * Clave nueva para el script de la PC del local. Se muestra una sola vez: se guarda sólo su hash, y la
 * anterior deja de funcionar. Sólo superadmin.
 */
export async function generateSyncKey(): Promise<SistemaResult<{ key: string }>> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Sólo un superadmin puede generar la clave." }
  }
  const key = randomBytes(24).toString("base64url")
  await saveSettings({ syncKeyHash: hashSyncKey(key) })
  revalidatePath("/admin/sistema")
  return { ok: true, key }
}

/** Mostrar el stock en la tienda / tomar los precios del sistema. */
export async function updateSyncOptions(input: {
  stockInStore: boolean
  pricesFromSystem: boolean
}): Promise<SistemaResult> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, error: NOT_ADMIN }
  }
  await saveSettings({
    stockInStore: input?.stockInStore === true ? "true" : "false",
    pricesFromSystem: input?.pricesFromSystem === true ? "true" : "false",
  })
  revalidateStore()
  return { ok: true }
}

export type SystemArticleOption = { systemId: number; code: string; name: string; price: number; stock: number }

/** Artículos del sistema todavía sin vincular, para elegir a mano. */
export async function searchSystemArticles(query: string): Promise<SystemArticleOption[]> {
  await requireAdmin()
  const q = typeof query === "string" ? query.trim().slice(0, 100) : ""
  return db
    .select({
      systemId: systemArticles.systemId,
      code: systemArticles.code,
      name: systemArticles.name,
      price: systemArticles.price,
      stock: systemArticles.stock,
    })
    .from(systemArticles)
    .where(
      and(
        isNull(systemArticles.productId),
        q ? ilike(systemArticles.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
      ),
    )
    .orderBy(asc(systemArticles.name))
    .limit(20)
}

/** Vincula a mano un producto de la tienda con un artículo del sistema (y le pasa el precio, si corresponde). */
export async function linkProduct(productId: number, systemId: number): Promise<SistemaResult> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, error: NOT_ADMIN }
  }
  if (!Number.isInteger(productId) || !Number.isInteger(systemId)) return { ok: false, error: "Datos inválidos" }
  const { pricesFromSystem } = await getSyncConfig()

  const error = await db.transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId))
    if (!product) return "El producto no existe"
    const [taken] = await tx
      .select({ name: systemArticles.name })
      .from(systemArticles)
      .where(eq(systemArticles.productId, productId))
    if (taken) return `Ese producto ya está vinculado a "${taken.name}"`
    const [article] = await tx
      .select({ productId: systemArticles.productId, price: systemArticles.price })
      .from(systemArticles)
      .where(eq(systemArticles.systemId, systemId))
    if (!article) return "Ese artículo ya no está en el sistema del local"
    if (article.productId !== null) return "Ese artículo del sistema ya está vinculado a otro producto"

    await tx
      .update(systemArticles)
      .set({ productId, linkSource: "manual" })
      .where(and(eq(systemArticles.systemId, systemId), isNull(systemArticles.productId)))
    if (pricesFromSystem && article.price > 0) {
      await tx.update(products).set({ price: article.price, updatedAt: new Date() }).where(eq(products.id, productId))
    }
    return null
  })
  if (error) return { ok: false, error }
  revalidateStore()
  return { ok: true }
}

/**
 * Saca el vínculo: el producto vuelve a venderse sin datos del sistema. El artículo queda "desvinculado"
 * para que la próxima sincronización no lo vuelva a vincular solo por nombre.
 */
export async function unlinkProduct(productId: number): Promise<SistemaResult> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, error: NOT_ADMIN }
  }
  if (!Number.isInteger(productId)) return { ok: false, error: "Datos inválidos" }
  await db
    .update(systemArticles)
    .set({ productId: null, linkSource: "desvinculado" })
    .where(eq(systemArticles.productId, productId))
  revalidateStore()
  return { ok: true }
}
