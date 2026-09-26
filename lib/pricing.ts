// Precio por tramos. Un artículo se vende en una o más presentaciones (unidad, pack x6, caja x12):
// el cliente elige cuántas unidades quiere y se cobra la combinación más barata de presentaciones.
//
//   Unidad $1.100 y Pack x6 $6.000 (= $1.000 c/u):
//   6 u. = 1 pack = $6.000 · 7 u. = 1 pack + 1 u. = $7.100 · 13 u. = 2 packs + 1 u. = $13.100
//
// La presentación más chica marca el paso: si solo hay "Pack x6", se compran múltiplos de 6.
// Lo usan el catálogo y el carrito (navegador) y createOrder (servidor, que recalcula siempre).
// Sin imports: tiene que funcionar igual en los dos lados.

export type Tier = {
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

/** Ordena por tamaño y, si dos presentaciones tienen el mismo tamaño, se queda con la más barata. */
export function normalizeTiers(tiers: Tier[]): Tier[] {
  const bySize = new Map<number, Tier>()
  for (const t of tiers) {
    const size = Math.max(1, Math.floor(t.packSize || 1))
    if (!(t.price > 0)) continue
    const current = bySize.get(size)
    if (!current || t.price < current.price) bySize.set(size, { ...t, packSize: size })
  }
  return [...bySize.values()].sort((a, b) => a.packSize - b.packSize)
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
  const desc = [...sorted].reverse()
  const cost = new Array<number>(n + 1).fill(Infinity)
  const pick = new Array<number>(n + 1).fill(-1)
  cost[0] = 0
  for (let u = 1; u <= n; u++) {
    for (let i = 0; i < desc.length; i++) {
      const t = desc[i]
      if (t.packSize > u || cost[u - t.packSize] === Infinity) continue
      const c = cost[u - t.packSize] + t.price
      if (c < cost[u]) {
        cost[u] = c
        pick[u] = i
      }
    }
  }
  if (cost[n] === Infinity) return null

  const counts = new Map<number, number>()
  for (let u = n; u > 0; u -= desc[pick[u]].packSize) counts.set(pick[u], (counts.get(pick[u]) ?? 0) + 1)
  const lines = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, count]) => ({ tier: desc[i], count }))
  return { units: n, total: cost[n], lines }
}

/** Precio promedio por unidad de una combinación, redondeado a pesos. */
export function averageUnitPrice(breakdown: Breakdown): number {
  return Math.round(breakdown.total / breakdown.units)
}

/** "1 pack x6 + 1 u." */
export function describeBreakdown(breakdown: Breakdown): string {
  return breakdown.lines
    .map(({ tier, count }) => (tier.packSize === 1 ? `${count} u.` : `${count} ${tier.label.toLowerCase()}`))
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
