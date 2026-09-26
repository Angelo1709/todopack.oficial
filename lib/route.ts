// Recorrido de reparto: coordenadas, distancias y orden de visita que minimiza los km.
// Puro (sin base ni red): lo usan el servidor, el navegador y scripts/check-route.mjs.
// Sin alias `@/` ni imports: Node lo ejecuta quitando los tipos.

export type LatLng = { lat: number; lng: number }

// ---- Puntos fijos del recorrido (se configuran en /admin/configuracion) ----

export const ROUTE_PLACES = ["local", "deposito"] as const
export type RoutePlace = (typeof ROUTE_PLACES)[number]

export const ROUTE_PLACE_LABEL: Record<RoutePlace, string> = {
  local: "Local",
  deposito: "Depósito",
}

/** Dónde termina el recorrido: en uno de los puntos fijos o en la última entrega (no vuelve). */
export const ROUTE_ENDS = ["local", "deposito", "ultima"] as const
export type RouteEnd = (typeof ROUTE_ENDS)[number]

/** Configuración del recorrido ya interpretada (ver getRouteConfig en lib/settings.ts). */
export type RouteConfig = {
  /** Se agrega a las direcciones de los pedidos para buscarlas en el mapa. */
  city: string
  places: Record<RoutePlace, { address: string; location: LatLng | null }>
  start: RoutePlace
  end: RouteEnd
}

/** Punto para acotar las búsquedas a la zona del negocio: el de salida o el que esté cargado. */
export function referencePoint(config: RouteConfig): LatLng | null {
  return config.places[config.start].location ?? config.places.deposito.location ?? config.places.local.location
}

export function isRoutePlace(value: unknown): value is RoutePlace {
  return ROUTE_PLACES.includes(value as RoutePlace)
}

export function isRouteEnd(value: unknown): value is RouteEnd {
  return ROUTE_ENDS.includes(value as RouteEnd)
}

// ---- Ubicación de un pedido (orders.location_status) ----

// exacta: se encontró la casa · aproximada: sólo la calle o la zona · manual: la cargó el admin.
// no_encontrada: se buscó y no apareció. null (en la base) = todavía no se buscó.
export const LOCATION_STATUSES = ["exacta", "aproximada", "manual", "no_encontrada"] as const
export type LocationStatus = (typeof LOCATION_STATUSES)[number]

export function isLocationStatus(value: unknown): value is LocationStatus {
  return LOCATION_STATUSES.includes(value as LocationStatus)
}

// ---- Coordenadas ----

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // 0,0 es lo que queda cuando algo falló, no una dirección real.
    !(lat === 0 && lng === 0)
  )
}

/** "-33.532100,-61.123400" (6 decimales ≈ 10 cm). Es el formato que se guarda en la configuración. */
export function formatLatLng(p: LatLng): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
}

function point(lat: number, lng: number): LatLng | null {
  return isValidLatLng(lat, lng) ? { lat, lng } : null
}

function dms(deg: string, min: string, sec: string, hemi: string) {
  const value = Number(deg) + Number(min) / 60 + Number(sec) / 3600
  return /[SWO]/i.test(hemi) ? -value : value
}

/**
 * Coordenadas pegadas por el admin: "-33.5321, -61.1234", `33°32'05.6"S 61°07'24.4"W` o un link largo de
 * Google Maps / OpenStreetMap. null si no hay un par válido (los links cortos se resuelven en el servidor).
 */
export function parseLatLng(input: string): LatLng | null {
  let text = input.trim()
  if (!text) return null
  try {
    text = decodeURIComponent(text)
  } catch {
    // Texto con "%" suelto: se usa tal cual.
  }

  // Grados, minutos y segundos (Google Maps los muestra así al tocar un punto).
  const d = text.match(
    /(\d{1,2})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)(?:["″]|'')?\s*([NS])[\s,;]+(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)(?:["″]|'')?\s*([EOW])/i,
  )
  if (d) return point(dms(d[1], d[2], d[3], d[4]), dms(d[5], d[6], d[7], d[8]))

  const num = String.raw`(-?\d{1,3}\.\d+)`
  // Sueltos se exigen 3+ decimales para no confundir "Ruta 90 km 3.5" con coordenadas.
  const loose = String.raw`(-?\d{1,3}\.\d{3,})`
  const patterns = [
    // Pin de un lugar de Google Maps (más preciso que el centro del mapa "@lat,lng").
    new RegExp(String.raw`!3d${num}!4d${num}`),
    // OpenStreetMap: ?mlat=..&mlon=.. y #map=zoom/lat/lng
    new RegExp(String.raw`mlat=${num}&mlon=${num}`),
    new RegExp(String.raw`map=\d+(?:\.\d+)?/${num}/${num}`),
    // Par decimal suelto o dentro de un link (?q=, /search/, @lat,lng, destination=...).
    new RegExp(String.raw`${loose}\s*[,;]\s*\+?\s*${loose}`),
    new RegExp(String.raw`^\s*\(?\s*${loose}\s+${loose}\s*\)?\s*$`),
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const p = point(Number(m[1]), Number(m[2]))
      if (p) return p
    }
  }
  return null
}

/** Parece un link corto de Google Maps (maps.app.goo.gl/...), que hay que abrir para ver las coordenadas. */
export function isShortMapsLink(input: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\/\S+$/i.test(input.trim())
}

const EARTH_RADIUS_KM = 6371

/** Distancia en línea recta (km). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ---- Orden de visita ----

export type PlannedRoute = {
  /** Índices de `stops` en el orden de visita. */
  order: number[]
  /** km de cada tramo: salida → 1ª parada, ..., última parada → llegada (si hay llegada). */
  legsKm: number[]
  totalKm: number
}

/** Hasta esta cantidad de paradas se prueba todo (programación dinámica): el orden es el óptimo. */
export const EXACT_MAX_STOPS = 12
const EPS = 1e-9

/**
 * Orden de visita que minimiza la distancia total: sale de `start`, pasa por todas las `stops` y termina
 * en `end` (o en la última parada si `end` es null). Hasta EXACT_MAX_STOPS es exacto; con más, vecino más
 * cercano mejorado con 2-opt y or-opt. Determinístico: mismos datos, mismo orden.
 */
export function planRoute(
  start: LatLng,
  stops: LatLng[],
  end: LatLng | null,
  // Sólo para las verificaciones: forzar el método aproximado y compararlo con el exacto.
  { exactMaxStops = EXACT_MAX_STOPS }: { exactMaxStops?: number } = {},
): PlannedRoute {
  const n = stops.length
  if (n === 0) {
    const legsKm = end ? [distanceKm(start, end)] : []
    return { order: [], legsKm, totalKm: legsKm.reduce((a, b) => a + b, 0) }
  }

  // Nodos: 0 = salida, 1..n = paradas, n + 1 = llegada (si hay).
  const nodes = [start, ...stops, ...(end ? [end] : [])]
  const endNode = end ? n + 1 : -1
  const dist = nodes.map((a) => nodes.map((b) => distanceKm(a, b)))
  // Hacia "ninguna llegada" (-1) el tramo no cuenta.
  const d = (a: number, b: number) => (a < 0 || b < 0 ? 0 : dist[a][b])

  // Tope duro: el exacto crece como 2^n (con 12 paradas son ~50 mil estados).
  const exact = n <= Math.min(exactMaxStops, EXACT_MAX_STOPS)
  const tour = exact ? exactTour(n, d, endNode) : improvedTour(n, d, endNode)

  const legsKm: number[] = []
  let prev = 0
  for (const node of tour) {
    legsKm.push(d(prev, node))
    prev = node
  }
  if (endNode >= 0) legsKm.push(d(prev, endNode))
  return { order: tour.map((node) => node - 1), legsKm, totalKm: legsKm.reduce((a, b) => a + b, 0) }
}

type Dist = (a: number, b: number) => number

/** Held-Karp: costo mínimo de salir de 0, visitar el conjunto `mask` y quedar en la parada j. */
function exactTour(n: number, d: Dist, endNode: number): number[] {
  const size = 1 << n
  const cost = new Float64Array(size * n).fill(Infinity)
  const parent = new Int8Array(size * n).fill(-1)
  for (let j = 0; j < n; j++) cost[(1 << j) * n + j] = d(0, j + 1)

  for (let mask = 1; mask < size; mask++) {
    for (let j = 0; j < n; j++) {
      const here = cost[mask * n + j]
      if (!(mask & (1 << j)) || here === Infinity) continue
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue
        const next = mask | (1 << k)
        const c = here + d(j + 1, k + 1)
        if (c < cost[next * n + k] - EPS) {
          cost[next * n + k] = c
          parent[next * n + k] = j
        }
      }
    }
  }

  const full = size - 1
  let last = 0
  let best = Infinity
  for (let j = 0; j < n; j++) {
    const c = cost[full * n + j] + d(j + 1, endNode)
    if (c < best - EPS) {
      best = c
      last = j
    }
  }

  const tour: number[] = []
  let mask = full
  let j = last
  while (j >= 0) {
    tour.push(j + 1)
    const p = parent[mask * n + j]
    mask &= ~(1 << j)
    j = p
  }
  return tour.reverse()
}

/** Reintentos desde variantes del mejor recorrido (búsqueda local iterada). */
const RESTARTS = 80

/**
 * Vecino más cercano y mejoras locales hasta que ninguna acorte el recorrido. Después se "sacude" el mejor
 * recorrido (se reordenan tres tramos) y se vuelve a mejorar, para salir de soluciones que sólo parecen buenas.
 */
function improvedTour(n: number, d: Dist, endNode: number): number[] {
  const tour: number[] = []
  const pending = new Set(Array.from({ length: n }, (_, i) => i + 1))
  let current = 0
  while (pending.size > 0) {
    let best = -1
    for (const node of pending) if (best < 0 || d(current, node) < d(current, best) - EPS) best = node
    tour.push(best)
    pending.delete(best)
    current = best
  }

  const cost = (t: number[]) => {
    let km = d(0, t[0]) + d(t[t.length - 1], endNode)
    for (let i = 1; i < t.length; i++) km += d(t[i - 1], t[i])
    return km
  }

  localSearch(tour, d, endNode)
  let best = tour
  let bestKm = cost(best)
  if (n < 4) return best

  // Semilla fija: mismo pedido de entrada, mismo resultado.
  let seed = n * 7919
  const random = (max: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return (seed >>> 16) % max
  }
  for (let k = 0; k < RESTARTS; k++) {
    // Cortes 0 <= a < b < c <= n: A B C D -> A C B D. La salida no está en `best`, así que A o D
    // pueden quedar vacíos (cambia la primera o la última entrega).
    const a = random(n - 1)
    const b = a + 1 + random(n - a - 1)
    const c = b + 1 + random(n - b)
    const candidate = [...best.slice(0, a), ...best.slice(b, c), ...best.slice(a, b), ...best.slice(c)]
    localSearch(candidate, d, endNode)
    const km = cost(candidate)
    if (km < bestKm - EPS) {
      best = candidate
      bestKm = km
    }
  }
  return best
}

/** 2-opt y or-opt sobre `tour` (lo modifica) hasta que ningún cambio acorte el recorrido. */
function localSearch(tour: number[], d: Dist, endNode: number) {
  const n = tour.length
  const prevOf = (t: number[], i: number) => (i === 0 ? 0 : t[i - 1])
  const nextOf = (t: number[], i: number) => (i === t.length - 1 ? endNode : t[i + 1])

  for (let round = 0; round < 500; round++) {
    let improved = false

    // 2-opt: invertir un tramo si así se descruzan dos caminos.
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = prevOf(tour, i)
        const e = nextOf(tour, j)
        const delta = d(a, tour[j]) + d(tour[i], e) - d(a, tour[i]) - d(tour[j], e)
        if (delta < -EPS) {
          const reversed = tour.slice(i, j + 1).reverse()
          tour.splice(i, j - i + 1, ...reversed)
          improved = true
          break
        }
      }
    }

    // Or-opt: mover 1, 2 o 3 paradas seguidas a otro lugar del recorrido (en cualquier sentido).
    for (let len = 1; len <= 3 && !improved; len++) {
      for (let i = 0; i + len <= n && !improved; i++) {
        const seg = tour.slice(i, i + len)
        const before = prevOf(tour, i)
        const after = nextOf(tour, i + len - 1)
        const saved = d(before, seg[0]) + d(seg[len - 1], after) - d(before, after)
        const rest = [...tour.slice(0, i), ...tour.slice(i + len)]
        for (let p = 0; p <= rest.length && !improved; p++) {
          const u = p === 0 ? 0 : rest[p - 1]
          const v = p === rest.length ? endNode : rest[p]
          for (const piece of [seg, [...seg].reverse()]) {
            if (p === i && piece === seg) continue
            const added = d(u, piece[0]) + d(piece[len - 1], v) - d(u, v)
            if (added < saved - EPS) {
              tour.splice(0, n, ...rest.slice(0, p), ...piece, ...rest.slice(p))
              improved = true
              break
            }
          }
        }
      }
    }

    if (!improved) break
  }
}

// ---- Links de Google Maps (gratis, sin API key) ----

/** Google Maps acepta hasta 9 paradas intermedias por link: los recorridos largos se parten en tramos. */
export const MAPS_MAX_WAYPOINTS = 9

function coords(p: LatLng) {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
}

/** Links de "Cómo llegar" que cubren el recorrido completo `points` (salida, paradas y llegada). */
export function googleMapsRouteUrls(points: LatLng[]): string[] {
  const urls: string[] = []
  const chunk = MAPS_MAX_WAYPOINTS + 2
  for (let i = 0; i < points.length - 1; i += chunk - 1) {
    const part = points.slice(i, i + chunk)
    const params = new URLSearchParams({
      api: "1",
      origin: coords(part[0]),
      destination: coords(part[part.length - 1]),
      travelmode: "driving",
    })
    if (part.length > 2) params.set("waypoints", part.slice(1, -1).map(coords).join("|"))
    urls.push(`https://www.google.com/maps/dir/?${params}`)
  }
  return urls
}

/** "Cómo llegar" desde donde esté el repartidor hasta `p`. */
export function googleMapsDirectionsUrl(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coords(p)}&travelmode=driving`
}

/** El punto marcado en Google Maps (para revisar que la ubicación sea la correcta). */
export function googleMapsPointUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${coords(p)}`
}

/** "3,4 km" / "850 m". */
export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} m`
  return `${km.toLocaleString("es-AR", { maximumFractionDigits: 1 })} km`
}
