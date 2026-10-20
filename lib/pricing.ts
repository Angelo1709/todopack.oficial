// Precio por tramos. Un artículo se vende en una o más presentaciones (unidad, pack x6, caja x12):
// el cliente elige cuántas unidades quiere y se cobra la combinación más barata de presentaciones.
//
//   Unidad $1.100 y Pack x6 $6.000 (= $1.000 c/u):
//   6 u. = 1 pack = $6.000 · 7 u. = 1 pack + 1 u. = $7.100 · 13 u. = 2 packs + 1 u. = $13.100
//
// La presentación más chica marca el paso: si solo hay "Pack x6", se compran múltiplos de 6.
// Lo usan el catálogo y el carrito (navegador) y createOrder (servidor, que recalcula siempre).
// Dependencias puras: funciona igual en navegador y servidor.
//
// Descuentos: la oferta de cada presentación (lib/offers.ts) y el descuento web general (lib/promo.ts,
// `webDiscount`) no se suman; cada presentación paga el mayor y el optimizador elige lo más barato.

import { effectivePrice, visibleOffer, type Offer } from "./offers.ts"

export type Tier = {
  offer?: Offer | null
  /** Descuento web (%) vigente cuando se armó el artículo; 0 o ausente = sin descuento. */
  webDiscount?: number
  /** Producto (fila de products) de esta presentación. */
  productId: number
  /** Nombre tal cual la lista de precios, ej. "7UP 1.5 LT DESCARTABLE PACK X6". */
  name: string
  /** "Unidad", "Pack x6", "Caja x12"... */
  label: string
  /** Unidades que incluye el precio. */
  packSize: number
  /** Precio de la presentación completa, en pesos enteros. */
  price: number
}

export type BreakdownLine = { tier: Tier; count: number }

export type Breakdown = {
  units: number
  total: number
  /** De la presentación más grande a la más chica. */
  lines: BreakdownLine[]
}

/** Tope de unidades por artículo en un pedido. */
export const MAX_UNITS = 5000

/** Precio que se paga por la presentación (con su oferta porcentual o el descuento web, el mayor). */
export function tierPrice(tier: Tier): number {
  return effectivePrice(tier.price, tier.offer, tier.webDiscount)
}

/**
 * Las mismas presentaciones sin el descuento web, para saber cuánto se ahorra con él. Tampoco llevan
 * las ofertas que el descuento tapa (un 5% con 10% web no se anuncia): el ahorro coincide con lo que
 * ve el cliente, precio de lista tachado contra precio con descuento.
 */
export function withoutWebDiscount(tiers: Tier[]): Tier[] {
  return tiers.map((t) => ({ ...t, offer: visibleOffer(t.offer, t.webDiscount), webDiscount: 0 }))
}

/** Conserva el precio más bajo por tamaño y las ofertas alternativas para comparar combos. */
export function normalizeTiers(tiers: Tier[]): Tier[] {
  const bySize = new Map<number, Tier>()
  for (const t of tiers) {
    const size = Math.max(1, Math.floor(t.packSize || 1))
    if (!(t.price > 0)) continue
    const current = bySize.get(size)
    if (!current || tierPrice(t) < tierPrice(current)) bySize.set(size, { ...t, packSize: size })
  }
  const selected = [...bySize.values()]
  const selectedIds = new Set(selected.map((t) => t.productId))
  for (const tier of tiers) {
    if (tier.price > 0 && tier.offer?.active && !selectedIds.has(tier.productId)) {
      selected.push({ ...tier, packSize: Math.max(1, Math.floor(tier.packSize || 1)) })
      selectedIds.add(tier.productId)
    }
  }
  return selected.sort((a, b) => a.packSize - b.packSize || tierPrice(a) - tierPrice(b))
}

/** De a cuántas unidades se compra (tamaño de la presentación más chica). */
export function stepUnits(tiers: Tier[]): number {
  return normalizeTiers(tiers)[0]?.packSize ?? 1
}

/** Lleva una cantidad al múltiplo válido más cercano hacia arriba (0 si es 0 o menos). */
export function snapUnits(tiers: Tier[], units: number): number {
  if (!(units > 0)) return 0
  const step = stepUnits(tiers)
  return Math.min(Math.ceil(units / step) * step, Math.floor(MAX_UNITS / step) * step)
}

export function unitPriceOf(tier: Tier): number {
  return tier.price / tier.packSize
}

/**
 * Combinación más barata de presentaciones para exactamente `units` unidades.
 * null si no se puede armar (ej. 4 u. cuando solo hay pack x6).
 */
export function priceFor(tiers: Tier[], units: number): Breakdown | null {
  const sorted = normalizeTiers(tiers)
  const n = Math.floor(units)
  if (!sorted.length || !(n > 0) || n > MAX_UNITS) return null

  // Mochila sin límite, costo mínimo con suma exacta. En empate gana la presentación más grande.
  // Las líneas guardan el precio ya pagado (sin webDiscount, para no volver a descontarlo).
  const desc = [...sorted].reverse().flatMap((tier) => {
    const price = tierPrice(tier)
    const regular = { tier: { ...tier, price, webDiscount: 0 }, units: tier.packSize, cost: price, paid: 1, free: 0 }
    if (!tier.offer?.active || tier.offer.kind !== "bundle") return [regular]
    // El combo va a precio de lista: no se suma al descuento web (la compra suelta ya lo tiene).
    return [{ tier: { ...tier, webDiscount: 0 }, units: tier.packSize * tier.offer.buy, cost: tier.price * tier.offer.pay,
      paid: tier.offer.pay, free: tier.offer.buy - tier.offer.pay }, regular]
  })
  const cost = new Array<number>(n + 1).fill(Infinity)
  const pick = new Array<number>(n + 1).fill(-1)
  cost[0] = 0
  for (let u = 1; u <= n; u++) {
    for (let i = 0; i < desc.length; i++) {
      const t = desc[i]
      if (t.units > u || cost[u - t.units] === Infinity) continue
      const c = cost[u - t.units] + t.cost
      if (c < cost[u]) {
        cost[u] = c
        pick[u] = i
      }
    }
  }
  if (cost[n] === Infinity) return null

  const counts = new Map<number, number>()
  for (let u = n; u > 0; u -= desc[pick[u]].units) counts.set(pick[u], (counts.get(pick[u]) ?? 0) + 1)
  const lines = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([i, count]) => {
      const choice = desc[i]
      return [{ tier: choice.tier, count: count * choice.paid },
        ...(choice.free ? [{ tier: { ...choice.tier, price: 0 }, count: count * choice.free }] : [])]
    })
  return { units: n, total: cost[n], lines }
}

/** Precio promedio por unidad de una combinación, redondeado a pesos. */
export function averageUnitPrice(breakdown: Breakdown): number {
  return Math.round(breakdown.total / breakdown.units)
}

/** "1 pack x6 + 1 u." */
export function describeBreakdown(breakdown: Breakdown): string {
  return breakdown.lines
    .map(({ tier, count }) => (tier.packSize === 1 ? `${count} u.${tier.price === 0 ? " bonificadas" : ""}` : `${count} ${tier.label.toLowerCase()}${tier.price === 0 ? " bonificados" : ""}`))
    .join(" + ")
}

/** "7 u." o, si se vende por pack, "2 packs x6 (12 u.)" usando la etiqueta de la presentación base. */
export function describeQuantity(tiers: Tier[], units: number): string {
  const base = normalizeTiers(tiers)[0]
  if (!base || base.packSize === 1) return `${units} u.`
  const count = Math.round(units / base.packSize)
  return `${count} × ${base.label.toLowerCase()} (${units} u.)`
}

/** % que se ahorra por unidad con esta presentación frente a la más chica (0 si no conviene). */
export function savingsPercent(tiers: Tier[], tier: Tier): number {
  const base = normalizeTiers(tiers)[0]
  if (!base || tier.packSize <= base.packSize) return 0
  const pct = Math.floor((1 - unitPriceOf(tier) / unitPriceOf(base)) * 100)
  return pct > 0 ? pct : 0
}

/**
 * Cuántas unidades faltan para llegar al próximo precio mayorista, si conviene.
 * Ej. unidad + pack x6 con 4 u. en el carrito: faltan 2 para pagar el precio del pack.
 */
export function nextTierHint(tiers: Tier[], units: number): { tier: Tier; missing: number } | null {
  const sorted = normalizeTiers(tiers)
  const base = sorted[0]
  if (!base || !(units > 0)) return null
  const cheaper = sorted.filter((t) => t.packSize > base.packSize && unitPriceOf(t) < unitPriceOf(base))
  if (!cheaper.length) return null

  const next = cheaper.find((t) => t.packSize > units)
  if (next) return { tier: next, missing: next.packSize - units }
  const largest = cheaper[cheaper.length - 1]
  const rest = units % largest.packSize
  return rest > 0 ? { tier: largest, missing: largest.packSize - rest } : null
}
