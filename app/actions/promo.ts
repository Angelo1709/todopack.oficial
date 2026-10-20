"use server"

import { asc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { banners, settings } from "@/lib/db/schema"
import { normalizeBannerLink, siteOrigins } from "@/lib/banners"
import { isPhotoId } from "@/lib/photo-review-store"
import { isWebDiscountPercent, MAX_ANNOUNCEMENT_LENGTH, MAX_WEB_DISCOUNT, type PromoSettings } from "@/lib/promo"
import { getPromoSettings, PROMO_SETTING_KEYS } from "@/lib/settings"
import { requireAdmin } from "@/lib/session"

// Admin → Promociones: descuento web, barra de anuncio y banners de la portada.
// El alta de banners (con imágenes) va por app/api/admin/banners.

type Result<T = undefined> = { ok: true; values?: T } | { ok: false; error: string }

async function admin(): Promise<string | null> {
  try {
    await requireAdmin()
    return null
  } catch {
    return "Tu sesión no tiene permisos de administrador. Volvé a ingresar."
  }
}

/** Revalida la tienda entera: el descuento y la barra se ven en todas sus páginas y en el carrito. */
function revalidateStore() {
  revalidatePath("/", "layout")
}

export async function updatePromoSettings(input: PromoSettings): Promise<Result<PromoSettings>> {
  const denied = await admin()
  if (denied) return { ok: false, error: denied }

  const percent = Number(input?.webDiscountPercent)
  if (!isWebDiscountPercent(percent)) {
    return { ok: false, error: `El descuento tiene que ser un número entero entre 1 y ${MAX_WEB_DISCOUNT}%.` }
  }
  const text = typeof input?.announcementText === "string" ? input.announcementText.trim().replace(/\s+/g, " ") : ""
  if (text.length > MAX_ANNOUNCEMENT_LENGTH) {
    return { ok: false, error: `El texto de la barra puede tener hasta ${MAX_ANNOUNCEMENT_LENGTH} caracteres.` }
  }
  const values: PromoSettings = {
    webDiscountActive: input?.webDiscountActive === true,
    webDiscountPercent: percent,
    announcementActive: input?.announcementActive === true,
    announcementText: text,
  }
  const stored: Record<(typeof PROMO_SETTING_KEYS)[number], string> = {
    webDiscountActive: String(values.webDiscountActive),
    webDiscountPercent: String(values.webDiscountPercent),
    announcementActive: String(values.announcementActive),
    announcementText: values.announcementText,
  }
  const now = new Date()
  await db
    .insert(settings)
    .values(PROMO_SETTING_KEYS.map((key) => ({ key, value: stored[key], updatedAt: now })))
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: now } })

  revalidateStore()
  return { ok: true, values: await getPromoSettings() }
}

function validId(id: unknown): id is string {
  return isPhotoId(id)
}

export async function updateBanner(id: string, input: { title: string; link: string }): Promise<Result<{ title: string; link: string }>> {
  const denied = await admin()
  if (denied) return { ok: false, error: denied }
  if (!validId(id)) return { ok: false, error: "Banner inválido." }
  const title = typeof input?.title === "string" ? input.title.trim().replace(/\s+/g, " ").slice(0, 120) : ""
  const link = normalizeBannerLink(typeof input?.link === "string" ? input.link : "", siteOrigins((await headers()).get("origin")))
  if (link === null) {
    return { ok: false, error: "Revisá el link: pegá la dirección de una página (por ejemplo, copiada de la tienda) o dejalo vacío." }
  }
  const updated = await db.update(banners).set({ title, link, updatedAt: new Date() }).where(eq(banners.id, id)).returning({ id: banners.id })
  if (!updated.length) return { ok: false, error: "El banner ya no existe. Recargá la página." }
  revalidateStore()
  return { ok: true, values: { title, link } }
}

export async function setBannerActive(id: string, active: boolean): Promise<Result> {
  const denied = await admin()
  if (denied) return { ok: false, error: denied }
  if (!validId(id) || typeof active !== "boolean") return { ok: false, error: "Banner inválido." }
  const updated = await db.update(banners).set({ active, updatedAt: new Date() }).where(eq(banners.id, id)).returning({ id: banners.id })
  if (!updated.length) return { ok: false, error: "El banner ya no existe. Recargá la página." }
  revalidateStore()
  return { ok: true }
}

/** Cambia de lugar un banner con el de al lado (-1 = antes, 1 = después). */
export async function moveBanner(id: string, direction: -1 | 1): Promise<Result> {
  const denied = await admin()
  if (denied) return { ok: false, error: denied }
  if (!validId(id) || (direction !== -1 && direction !== 1)) return { ok: false, error: "Banner inválido." }
  const moved = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(9137302)`)
    const rows = await tx.select({ id: banners.id }).from(banners).orderBy(asc(banners.position), asc(banners.createdAt))
    const from = rows.findIndex((r) => r.id === id)
    if (from < 0) return false
    const to = from + direction
    if (to < 0 || to >= rows.length) return true
    const order = rows.map((r) => r.id)
    ;[order[from], order[to]] = [order[to], order[from]]
    // Renumera todo: así dos banners nunca quedan con la misma posición.
    for (const [position, bannerId] of order.entries()) {
      await tx.update(banners).set({ position: position + 1 }).where(eq(banners.id, bannerId))
    }
    return true
  })
  if (!moved) return { ok: false, error: "El banner ya no existe. Recargá la página." }
  revalidateStore()
  return { ok: true }
}

export async function deleteBanner(id: string): Promise<Result> {
  const denied = await admin()
  if (denied) return { ok: false, error: denied }
  if (!validId(id)) return { ok: false, error: "Banner inválido." }
  await db.delete(banners).where(eq(banners.id, id))
  revalidateStore()
  return { ok: true }
}
