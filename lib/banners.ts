import "server-only"
import { asc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { banners } from "@/lib/db/schema"

// Banners de la portada (Admin → Promociones): imágenes que sube el admin, guardadas en la base.
// Cada banner tiene versión para celular y/o computadora; si falta una, se usa la otra.
// Las imágenes de un banner no cambian nunca, por eso se sirven con caché "immutable".

export const BANNER_VARIANTS = ["celular", "compu"] as const
export type BannerVariant = (typeof BANNER_VARIANTS)[number]
export const MAX_BANNERS = 12

/** Tamaños recomendados para diseñar en Canva; la portada los muestra con esta proporción. */
export const BANNER_SIZES: Record<BannerVariant, { width: number; height: number; label: string }> = {
  celular: { width: 1080, height: 540, label: "Celular" },
  compu: { width: 1920, height: 600, label: "Computadora" },
}

export type BannerInfo = {
  id: string
  title: string
  link: string
  active: boolean
  /** URL de cada imagen (null si no se subió esa versión). */
  mobileUrl: string | null
  desktopUrl: string | null
}

export function isBannerVariant(value: unknown): value is BannerVariant {
  return BANNER_VARIANTS.includes(value as BannerVariant)
}

export function bannerImageUrl(id: string, variant: BannerVariant) {
  return `/api/banners/${id}/${variant}`
}

/** Datos de los banners sin los bytes de las imágenes. `onlyActive` = los que ve la tienda. */
export async function listBanners({ onlyActive = false } = {}): Promise<BannerInfo[]> {
  const rows = await db
    .select({
      id: banners.id,
      title: banners.title,
      link: banners.link,
      active: banners.active,
      hasMobile: sql<boolean>`${banners.mobileData} is not null`,
      hasDesktop: sql<boolean>`${banners.desktopData} is not null`,
    })
    .from(banners)
    .where(onlyActive ? eq(banners.active, true) : undefined)
    .orderBy(asc(banners.position), asc(banners.createdAt))
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    link: r.link,
    active: r.active,
    mobileUrl: r.hasMobile ? bannerImageUrl(r.id, "celular") : null,
    desktopUrl: r.hasDesktop ? bannerImageUrl(r.id, "compu") : null,
  }))
}

/** Bytes de una versión de un banner (activo o no: el panel muestra la vista previa de los pausados). */
export async function getBannerImage(id: string, variant: BannerVariant) {
  const [row] = await db
    .select(
      variant === "celular"
        ? { mime: banners.mobileMime, data: banners.mobileData }
        : { mime: banners.desktopMime, data: banners.desktopData },
    )
    .from(banners)
    .where(eq(banners.id, id))
  return row?.mime && row.data ? { mime: row.mime, data: row.data } : null
}

/**
 * Link de un banner: una página de la tienda (se guarda la ruta, "/?q=coca") o un sitio externo
 * (https://...). `siteOrigins` son los dominios propios: un link copiado de la tienda queda como ruta.
 * Devuelve null si no es un link válido; "" si no lleva link.
 */
export function normalizeBannerLink(raw: string, origins: string[]): string | null {
  const value = raw.trim()
  if (!value) return ""
  if (value.length > 500) return null
  if (value.startsWith("/") && !value.startsWith("//")) return value
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (origins.includes(url.origin)) return `${url.pathname}${url.search}${url.hash}` || "/"
  return url.href
}

/** Dominios propios de la tienda: el del pedido actual y los configurados (BETTER_AUTH_URL, Railway). */
export function siteOrigins(requestOrigin?: string | null): string[] {
  const candidates = [
    requestOrigin,
    process.env.BETTER_AUTH_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`,
  ]
  return [...new Set(candidates.flatMap((value) => {
    try {
      return value ? [new URL(value).origin] : []
    } catch {
      return []
    }
  }))]
}

/** true si el link lleva a otra página web (se abre en otra pestaña). */
export function isExternalLink(link: string) {
  return /^https?:\/\//i.test(link)
}
