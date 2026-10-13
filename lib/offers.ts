export type Offer = { title: string; kind: "percent" | "bundle"; percent: number; buy: number; pay: number; active: boolean }
export function offerLabel(offer: Offer): string {
  return offer.kind === "percent" ? `${offer.percent}% OFF` : `${offer.buy}x${offer.pay}`
}
export function offerTerms(offer: Offer, label: string): string {
  return offer.kind === "percent" ? `${offer.percent}% de descuento en ${label.toLowerCase()}.` : `Llevás ${offer.buy} y pagás ${offer.pay} de la misma presentación (${label.toLowerCase()}).`
}
export function effectivePrice(price: number, offer?: Offer | null): number {
  return offer?.active && offer.kind === "percent" ? Math.round(price * (100 - offer.percent) / 100) : price
}
