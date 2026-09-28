import "server-only"
import { and, asc, desc, eq, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { orders } from "@/lib/db/schema"
import { geocodeAddress } from "@/lib/geocode"
import { isFinalStatus, type OrderStatus, type PaymentMethod } from "@/lib/order-status"
import { referencePoint, type LatLng, type LocationStatus, type RouteConfig } from "@/lib/route"
import { getRouteConfig } from "@/lib/settings"

// Ubicación de las entregas (orders.lat / lng / location_status). Cada pedido se busca una sola vez.

/** Misma dirección sin importar mayúsculas ni espacios de más. */
function sameAddress(address: string): SQL {
  const norm = (value: SQL | typeof orders.address) => sql`lower(regexp_replace(trim(${value}), '[[:space:]]+', ' ', 'g'))`
  return sql`${norm(orders.address)} = ${norm(sql`${address}::text`)}`
}

export type LocateOutcome = LocationStatus | "error" | "ya_ubicado"

/**
 * Busca la ubicación de un pedido que todavía no la tiene. Si otro pedido con la misma dirección ya está
 * ubicado (cliente que repite) la reusa, priorizando la corregida a mano; si no, la busca en el mapa.
 */
export async function locateOrder(orderId: number, config?: RouteConfig): Promise<LocateOutcome> {
  const [order] = await db
    .select({ address: orders.address, locationStatus: orders.locationStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
  if (!order) return "error"
  if (order.locationStatus !== null) return "ya_ubicado"

  const [known] = await db
    .select({ lat: orders.lat, lng: orders.lng, locationStatus: orders.locationStatus })
    .from(orders)
    .where(and(ne(orders.id, orderId), isNotNull(orders.lat), sameAddress(order.address)))
    .orderBy(sql`${orders.locationStatus} = 'manual' DESC`, desc(orders.id))
    .limit(1)

  let update: { lat: number | null; lng: number | null; locationStatus: LocationStatus }
  if (known && known.lat !== null && known.lng !== null) {
    update = { lat: known.lat, lng: known.lng, locationStatus: known.locationStatus as LocationStatus }
  } else {
    const cfg = config ?? (await getRouteConfig())
    const result = await geocodeAddress(order.address, { city: cfg.city, near: referencePoint(cfg) })
    if (!result.ok && result.reason === "error") return "error"
    update = result.ok
      ? { lat: result.location.lat, lng: result.location.lng, locationStatus: result.precision }
      : { lat: null, lng: null, locationStatus: "no_encontrada" }
  }

  // Si mientras tanto el admin la cargó a mano, no se pisa.
  await db
    .update(orders)
    .set(update)
    .where(and(eq(orders.id, orderId), isNull(orders.locationStatus)))
  return update.locationStatus
}

export type LocateSummary = {
  located: number
  approximate: number
  notFound: number
  failed: number
  /** Siguen sin buscar (quedaron para otra vuelta). */
  remaining: number
}

/**
 * Busca las ubicaciones que faltan en los pedidos por entregar de `date`, de a uno (Nominatim admite
 * 1 por segundo). Se corta en `max` para no dejar al admin esperando: el resto queda en `remaining`.
 */
export async function locatePendingOrders(date: string, max = 20): Promise<LocateSummary> {
  const rows = await db
    .select({ id: orders.id, paymentMethod: orders.paymentMethod, status: orders.status })
    .from(orders)
    .where(and(eq(orders.deliveryDate, date), isNull(orders.locationStatus)))
    .orderBy(asc(orders.id))
  // Sólo los que todavía hay que llevar (los mismos que muestra el recorrido).
  const pending = rows.filter((o) => !isFinalStatus(o.paymentMethod as PaymentMethod, o.status as OrderStatus))

  const summary: LocateSummary = { located: 0, approximate: 0, notFound: 0, failed: 0, remaining: 0 }
  const config = await getRouteConfig()
  for (const [index, { id }] of pending.entries()) {
    if (index >= max) {
      summary.remaining = pending.length - index
      break
    }
    const outcome = await locateOrder(id, config)
    if (outcome === "exacta" || outcome === "manual") summary.located++
    else if (outcome === "aproximada") summary.approximate++
    else if (outcome === "no_encontrada") summary.notFound++
    else if (outcome === "error") summary.failed++
  }
  return summary
}

/**
 * Ubicación cargada por el admin. Se aplica también a los otros pedidos con la misma dirección que no
 * tengan una ubicación cargada a mano (así el cliente que repite ya queda bien ubicado).
 */
export async function setOrderLocation(orderId: number, location: LatLng): Promise<{ address: string } | null> {
  const [order] = await db.select({ address: orders.address }).from(orders).where(eq(orders.id, orderId))
  if (!order) return null
  const values = { lat: location.lat, lng: location.lng, locationStatus: "manual" as const }
  await db.transaction(async (tx) => {
    await tx.update(orders).set(values).where(eq(orders.id, orderId))
    await tx
      .update(orders)
      .set(values)
      .where(
        and(
          ne(orders.id, orderId),
          sameAddress(order.address),
          or(isNull(orders.locationStatus), ne(orders.locationStatus, "manual")),
        ),
      )
  })
  return order
}
