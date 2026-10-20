// Promociones generales de la tienda (Admin → Promociones). Puro: lo usan el servidor, el navegador y scripts.
//
// - Descuento web: un porcentaje sobre todos los productos, sólo para pedidos hechos en la web (los
//   manuales del panel no lo tienen). No se suma a la oferta de cada producto: se cobra el mayor
//   descuento (ver effectivePrice en lib/offers.ts y priceFor en lib/pricing.ts).
// - Barra de anuncio: una línea de texto arriba de todas las páginas de la tienda.

export type PromoSettings = {
  webDiscountActive: boolean
  /** 1–MAX_WEB_DISCOUNT; se guarda aunque esté apagado para volver a prenderlo igual. */
  webDiscountPercent: number
  announcementActive: boolean
  /** Vacío = texto automático del descuento (defaultAnnouncement). */
  announcementText: string
}

export const MAX_WEB_DISCOUNT = 50
export const MAX_ANNOUNCEMENT_LENGTH = 120

export const PROMO_DEFAULTS: PromoSettings = {
  webDiscountActive: false,
  webDiscountPercent: 10,
  announcementActive: false,
  announcementText: "",
}

export function isWebDiscountPercent(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_WEB_DISCOUNT
}

/** Porcentaje que se aplica hoy (0 = sin descuento web). */
export function activeWebDiscount(promo: PromoSettings): number {
  return promo.webDiscountActive && isWebDiscountPercent(promo.webDiscountPercent) ? promo.webDiscountPercent : 0
}

export function defaultAnnouncement(percent: number): string {
  return `${percent}% OFF en todos los pedidos hechos en la web`
}

/** Texto de la barra de anuncio, o null si no se muestra. */
export function announcementOf(promo: PromoSettings): string | null {
  if (!promo.announcementActive) return null
  const text = promo.announcementText.trim()
  if (text) return text
  const discount = activeWebDiscount(promo)
  return discount ? defaultAnnouncement(discount) : null
}
