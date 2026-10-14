"use server"

import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import { and, asc, eq, ilike, isNotNull, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { Offer } from "@/lib/offers"

const offerSchema = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(["percent", "bundle"]),
  percent: z.number().int().min(1).max(99),
  buy: z.number().int().min(2).max(20),
  pay: z.number().int().min(1).max(19),
  active: z.boolean(),
}).refine((o) => o.kind !== "bundle" || o.pay < o.buy, { message: "La cantidad a pagar debe ser menor a la que se lleva." })

export async function listOffers() {
  await requireAdmin()
  return db.select({ id: products.id, name: products.name, price: products.price, packSize: products.packSize,
    active: products.active, offer: products.offer }).from(products).where(isNotNull(products.offer)).orderBy(asc(products.name))
}
export async function searchOfferProducts(query: string) {
  await requireAdmin()
  const q = String(query ?? "").trim().slice(0, 100)
  if (q.length < 2) return []
  return db.select({ id: products.id, name: products.name, price: products.price, packSize: products.packSize,
    active: products.active, offer: products.offer }).from(products)
    .where(and(eq(products.active, true), ilike(products.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`)))
    .orderBy(asc(products.name)).limit(30)
}
export async function saveOffer(ids: number[], input: Offer) {
  await requireAdmin()
  const parsed = offerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Revisá el título y los valores de la oferta. El descuento debe ser entre 1 y 99%; en combos, pagás menos de lo que llevás." }
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    return { ok: false as const, error: "Elegí entre 1 y 100 presentaciones." }
  }
  const saved = await db.transaction(async (tx) => {
    const selected = [...new Set(ids)]
    const existing = await tx.select({ id: products.id }).from(products).where(inArray(products.id, selected)).for("update")
    if (existing.length !== selected.length) return false
    for (const id of selected) await tx.update(products).set({ offer: parsed.data, updatedAt: new Date() }).where(eq(products.id, id))
    return true
  })
  if (!saved) return { ok: false as const, error: "Algún producto ya no existe. Volvé a seleccionarlo." }
  revalidatePath("/")
  revalidatePath("/admin/productos")
  return { ok: true as const }
}
export async function toggleOffer(id: number, active: boolean) {
  await requireAdmin()
  if (!Number.isSafeInteger(id) || id <= 0 || typeof active !== "boolean") return { ok: false as const, error: "Oferta inválida." }
  const changed = await db.transaction(async (tx) => {
    const [row] = await tx.select({ offer: products.offer }).from(products).where(eq(products.id, id)).for("update")
    if (!row?.offer) return false
    await tx.update(products).set({ offer: { ...row.offer, active }, updatedAt: new Date() }).where(eq(products.id, id))
    return true
  })
  if (!changed) return { ok: false as const, error: "La oferta ya no existe. Volvé a abrir el panel." }
  revalidatePath("/")
  revalidatePath("/admin/productos")
  return { ok: true as const }
}
