export type Offer = { title: string; kind: "percent" | "bundle"; percent: number; buy: number; pay: number; active: boolean }
export function offerLabel(offer: Offer): string {
  return offer.kind === "percent" ? `${offer.percent}% OFF` : `${offer.buy}x${offer.pay}`
}
export function offerTerms(offer: Offer, label: string): string {
  return offer.kind === "percent" ? `${offer.percent}% de descuento en ${label.toLowerCase()}.` : `Llevás ${offer.buy} y pagás ${offer.pay} de la misma presentación (${label.toLowerCase()}).`
}
/**
 * Precio de una presentación con su oferta porcentual o con el descuento web (lib/promo.ts).
 * No se suman: se aplica el mayor de los dos. Un combo (2x1) no cambia el precio de a una: lo
 * resuelve priceFor, que compara el combo a precio de lista con la compra suelta con descuento web.
 */
export function effectivePrice(price: number, offer?: Offer | null, webDiscount = 0): number {
  const pct = Math.max(offer?.active && offer.kind === "percent" ? offer.percent : 0, webDiscount > 0 ? webDiscount : 0)
  return pct > 0 ? Math.round(price * (100 - pct) / 100) : price
}
/** La oferta propia que vale la pena mostrar: una porcentual que no supera al descuento web queda tapada por éste. */
export function visibleOffer(offer?: Offer | null, webDiscount = 0): Offer | null {
  if (!offer?.active) return null
  return offer.kind === "percent" && offer.percent <= webDiscount ? null : offer
}
