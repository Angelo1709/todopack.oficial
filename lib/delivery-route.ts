// Recorrido de una franja a partir de los pedidos del panel y la configuración (salida / llegada).
// Puro: se arma en el servidor al renderizar la vista "Recorrido".

import type { AdminOrder } from "@/lib/admin-orders-utils"
import { isFinalStatus, type DeliverySlot } from "@/lib/order-status"
import {
  ROUTE_PLACE_LABEL,
  googleMapsTripUrls,
  planRoute,
  type LatLng,
  type RouteConfig,
  type RoutePlace,
} from "@/lib/route"
import { streetDistances, streetPaths, type StreetGraph } from "@/lib/street-graph"

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
      /**
       * Cómo se midió: "calles" = todos los tramos por calle respetando las manos; "mixto" = algunos en
       * línea recta (direcciones fuera del mapa); "recta" = sin mapa de calles.
       */
      measuredBy: "calles" | "mixto" | "recta"
      /**
       * Camino de cada tramo para dibujar en el mapa ([lat, lng] esquina por esquina), en el orden de visita:
       * salida -> 1ª entrega, ..., última -> llegada. null = sin camino por calle (se dibuja en línea recta).
       */
      legPaths: ([number, number][] | null)[]
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

export function buildDeliveryRoute(
  orders: AdminOrder[],
  slot: DeliverySlot,
  config: RouteConfig,
  /** Mapa de calles (lib/street-map.ts); sin mapa se mide en línea recta. */
  streets: StreetGraph | null = null,
): DeliveryRoute {
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
  // Puntos: salida, entregas y llegada (el mismo orden que usa planRoute).
  const points = [start.location, ...located.map((o) => o.location), ...(end ? [end.location] : [])]
  const distances = streets && located.length > 0 ? streetDistances(streets, points) : null
  const plan = planRoute(
    start.location,
    located.map((o) => o.location),
    end?.location ?? null,
    { distances },
  )
  // ¿Algún tramo del recorrido elegido quedó sin medir por calle?
  const visit = [0, ...plan.order.map((i) => i + 1), ...(end ? [points.length - 1] : [])]
  const legs = visit.slice(1).map((to, k): [number, number] => [visit[k], to])
  const straightLegs = distances ? legs.filter(([from, to]) => distances[from][to] === null).length : 0
  const legPaths = streets && distances ? streetPaths(streets, points, legs) : legs.map(() => null)
  const stops = plan.order.map((index, i) => ({
    order: located[index],
    location: located[index].location,
    legKm: plan.legsKm[i],
  }))

  return {
    ...base,
    ok: true,
    start,
    end,
    stops,
    returnKm: end && stops.length > 0 ? plan.legsKm[plan.legsKm.length - 1] : null,
    totalKm: stops.length > 0 ? plan.totalKm : 0,
    measuredBy: !distances ? "recta" : straightLegs > 0 ? "mixto" : "calles",
    legPaths,
    mapsUrls:
      stops.length > 0
        ? googleMapsTripUrls(
            start.location,
            stops.map((s) => s.location),
            end?.location ?? null,
          )
        : [],
  }
}
