// Recorrido de una franja a partir de los pedidos del panel y la configuración (salida / llegada).
// Puro: se arma en el servidor al renderizar la vista "Recorrido".

import type { AdminOrder } from "@/lib/admin-orders-utils"
import { isFinalStatus, type DeliverySlot } from "@/lib/order-status"
import {
  ROUTE_PLACE_LABEL,
  googleMapsRouteUrls,
  planRoute,
  type LatLng,
  type RouteConfig,
  type RoutePlace,
} from "@/lib/route"

export type RouteEndpoint = { place: RoutePlace; label: string; address: string; location: LatLng }
export type RouteStop = { order: AdminOrder; location: LatLng; /** km desde el punto anterior. */ legKm: number }

export type DeliveryRoute = {
  slot: DeliverySlot
  /** Pedidos que todavía hay que llevar (no cancelados ni finalizados). */
  pendingCount: number
  /** Ya entregados en la franja: no entran en el recorrido. */
  deliveredCount: number
  /** Sin ubicación en el mapa: no entran hasta que se ubiquen. */
  unlocated: AdminOrder[]
} & (
  | {
      ok: true
      start: RouteEndpoint
      /** null = termina en la última entrega. */
      end: RouteEndpoint | null
      stops: RouteStop[]
      /** km de la última entrega a la llegada (null si no vuelve). */
      returnKm: number | null
      totalKm: number
      /** Links de Google Maps (más de uno si hay muchas paradas). */
      mapsUrls: string[]
    }
  | {
      ok: false
      /** Salida o llegada sin ubicar en Configuración. */
      missing: RoutePlace[]
    }
)

/** Todavía hay que llevarlo: efectivo sin cobrar o transferencia sin entregar (incluye pago sin validar). */
export function needsDelivery(order: AdminOrder) {
  return !isFinalStatus(order.paymentMethod, order.status)
}

function endpoint(config: RouteConfig, place: RoutePlace): RouteEndpoint | null {
  const { address, location } = config.places[place]
  return location ? { place, label: ROUTE_PLACE_LABEL[place], address, location } : null
}

export function buildDeliveryRoute(orders: AdminOrder[], slot: DeliverySlot, config: RouteConfig): DeliveryRoute {
  const slotOrders = orders.filter((o) => o.deliverySlot === slot && o.status !== "cancelado")
  const pending = slotOrders.filter(needsDelivery)
  const base = {
    slot,
    pendingCount: pending.length,
    deliveredCount: slotOrders.length - pending.length,
    unlocated: pending.filter((o) => !o.location),
  }

  const start = endpoint(config, config.start)
  const end = config.end === "ultima" ? null : endpoint(config, config.end)
  const missing = [...new Set([config.start, ...(config.end === "ultima" ? [] : [config.end])])].filter(
    (place) => !config.places[place].location,
  )
  if (!start || missing.length > 0) return { ...base, ok: false, missing }

  const located = pending.filter((o): o is AdminOrder & { location: LatLng } => o.location !== null)
  const plan = planRoute(
    start.location,
    located.map((o) => o.location),
    end?.location ?? null,
  )
  const stops = plan.order.map((index, i) => ({
    order: located[index],
    location: located[index].location,
    legKm: plan.legsKm[i],
  }))
  const points = [start.location, ...stops.map((s) => s.location), ...(end ? [end.location] : [])]

  return {
    ...base,
    ok: true,
    start,
    end,
    stops,
    returnKm: end && stops.length > 0 ? plan.legsKm[plan.legsKm.length - 1] : null,
    totalKm: stops.length > 0 ? plan.totalKm : 0,
    mapsUrls: stops.length > 0 ? googleMapsRouteUrls(points) : [],
  }
}
