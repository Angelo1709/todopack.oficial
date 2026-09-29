// Mapa de calles de OpenStreetMap para medir el recorrido POR CALLE, respetando las manos únicas.
// Puro (sin base ni red): lo usan el servidor (lib/street-map.ts, lib/delivery-route.ts) y
// scripts/check-streets.mjs. Sin alias `@/` ni imports: Node lo ejecuta quitando los tipos.

export type Point = { lat: number; lng: number }

export type StreetGraph = {
  /** [lat, lng] de cada esquina o quiebre de calle. */
  nodes: [number, number][]
  /** Tramos por los que se puede circular [desde, hasta] (índices de `nodes`). Doble mano = los dos sentidos. */
  edges: [number, number][]
}

/** Lo que devuelve la API Overpass de OpenStreetMap (`out body`): calles (way) y sus puntos (node). */
export type OsmElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}

/** Tipos de calle por los que puede andar el auto del reparto (sin veredas, senderos ni ciclovías). */
export const DRIVABLE_HIGHWAYS = [
  "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service", "road", "track",
] as const

const DRIVABLE = new Set<string>(DRIVABLE_HIGHWAYS)
const NO_ACCESS = new Set(["no", "private"])

export type Direction = "both" | "forward" | "backward"

/** Sentido de circulación según las etiquetas de OpenStreetMap. */
export function directionOf(tags: Record<string, string>): Direction {
  const oneway = (tags.oneway ?? "").toLowerCase()
  if (oneway === "yes" || oneway === "true" || oneway === "1") return "forward"
  if (oneway === "-1" || oneway === "reverse") return "backward"
  if (oneway === "no" || oneway === "false" || oneway === "0") return "both"
  // Rotondas y autopistas son de una sola mano aunque no lo digan.
  if (tags.junction === "roundabout" || tags.junction === "circular") return "forward"
  if (tags.highway === "motorway" || tags.highway === "motorway_link") return "forward"
  return "both"
}

export function isDrivable(tags: Record<string, string>): boolean {
  if (!DRIVABLE.has(tags.highway ?? "")) return false
  return ![tags.access, tags.vehicle, tags.motor_vehicle, tags.motorcar].some((v) => NO_ACCESS.has(v ?? ""))
}

export type BuiltStreetGraph = { graph: StreetGraph; ways: number; oneWays: number }

/** Arma el grafo de calles a partir de la respuesta de Overpass. */
export function buildStreetGraph(elements: OsmElement[]): BuiltStreetGraph {
  const coords = new Map<number, [number, number]>()
  for (const el of elements) {
    if (el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number") {
      coords.set(el.id, [el.lat, el.lon])
    }
  }
  const index = new Map<number, number>()
  const nodes: [number, number][] = []
  const nodeOf = (osmId: number) => {
    let i = index.get(osmId)
    if (i === undefined) {
      i = nodes.length
      index.set(osmId, i)
      nodes.push(coords.get(osmId)!)
    }
    return i
  }

  const edges: [number, number][] = []
  let ways = 0
  let oneWays = 0
  for (const el of elements) {
    if (el.type !== "way" || !el.nodes || !el.tags || !isDrivable(el.tags)) continue
    const ids = el.nodes.filter((id) => coords.has(id))
    if (ids.length < 2) continue
    const dir = directionOf(el.tags)
    ways++
    if (dir !== "both") oneWays++
    for (let k = 1; k < ids.length; k++) {
      const a = nodeOf(ids[k - 1])
      const b = nodeOf(ids[k])
      if (a === b) continue
      if (dir !== "backward") edges.push([a, b])
      if (dir !== "forward") edges.push([b, a])
    }
  }
  return { graph: { nodes, edges }, ways, oneWays }
}

// ---- Distancias por calle ----

const EARTH_RADIUS_KM = 6371

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Más lejos que esto de cualquier calle del mapa (otro pueblo, campo) el punto se mide en línea recta. */
export const SNAP_MAX_KM = 0.3

type Segment = { a: number; b: number; ab: boolean; ba: boolean }
type Snap = { segment: number; t: number; lat: number; lng: number }

/** Tramos de calle sin repetir (a < b), con los sentidos habilitados. */
function segmentsOf(graph: StreetGraph): Segment[] {
  const byKey = new Map<string, Segment>()
  for (const [u, v] of graph.edges) {
    const a = Math.min(u, v)
    const b = Math.max(u, v)
    const key = `${a}-${b}`
    const seg = byKey.get(key) ?? { a, b, ab: false, ba: false }
    if (u === a) seg.ab = true
    else seg.ba = true
    byKey.set(key, seg)
  }
  return [...byKey.values()]
}

/** Punto de la calle más cercano a `p` (proyección sobre el tramo), o null si está a más de SNAP_MAX_KM. */
function snapToStreet(graph: StreetGraph, segments: Segment[], p: Point): Snap | null {
  // Coordenadas planas en km alrededor del punto (en un pueblo el error es despreciable).
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180)
  const ky = 110.57
  let best: Snap | null = null
  let bestKm = Infinity
  for (const [s, seg] of segments.entries()) {
    const [aLat, aLng] = graph.nodes[seg.a]
    const [bLat, bLng] = graph.nodes[seg.b]
    const ax = (aLng - p.lng) * kx
    const ay = (aLat - p.lat) * ky
    const bx = (bLng - p.lng) * kx
    const by = (bLat - p.lat) * ky
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2))
    const km = Math.hypot(ax + t * dx, ay + t * dy)
    if (km < bestKm) {
      bestKm = km
      best = { segment: s, t, lat: aLat + t * (bLat - aLat), lng: aLng + t * (bLng - aLng) }
    }
  }
  return best && bestKm <= SNAP_MAX_KM ? best : null
}

/** Cola de prioridad mínima (montículo binario) para Dijkstra. */
class MinHeap {
  private items: [number, number][] = []
  get size() {
    return this.items.length
  }
  push(item: [number, number]) {
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (a[parent][0] <= a[i][0]) break
      ;[a[parent], a[i]] = [a[i], a[parent]]
      i = parent
    }
  }
  pop(): [number, number] {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

/** Grafo de calles con pesos + un nodo extra por cada punto ubicado sobre una calle. */
type Augmented = {
  /** Índice del nodo extra del punto i: base + i. */
  base: number
  adjacency: [number, number][][]
  coord: (node: number) => [number, number]
  snaps: (Snap | null)[]
}

function augment(graph: StreetGraph, points: Point[]): Augmented {
  const segments = segmentsOf(graph)
  const snaps = points.map((p) => snapToStreet(graph, segments, p))
  const base = graph.nodes.length
  const adjacency: [number, number][][] = Array.from({ length: base + points.length }, () => [])
  const coord = (i: number): [number, number] => {
    if (i < base) return graph.nodes[i]
    const snap = snaps[i - base]!
    return [snap.lat, snap.lng]
  }
  const link = (from: number, to: number) => {
    const [aLat, aLng] = coord(from)
    const [bLat, bLng] = coord(to)
    adjacency[from].push([to, haversineKm(aLat, aLng, bLat, bLng)])
  }
  for (const [u, v] of graph.edges) link(u, v)

  // Los puntos que caen en el mismo tramo se encadenan en orden (a -> p1 -> p2 -> b), para poder ir de uno
  // al otro por esa misma cuadra.
  const onSegment = new Map<number, number[]>()
  snaps.forEach((snap, i) => {
    if (snap) onSegment.set(snap.segment, [...(onSegment.get(snap.segment) ?? []), i])
  })
  for (const [s, idxs] of onSegment) {
    const seg = segments[s]
    const chain = [seg.a, ...idxs.sort((x, y) => snaps[x]!.t - snaps[y]!.t).map((i) => base + i), seg.b]
    for (let k = 1; k < chain.length; k++) {
      if (seg.ab) link(chain[k - 1], chain[k])
      if (seg.ba) link(chain[k], chain[k - 1])
    }
  }
  return { base, adjacency, coord, snaps }
}

/** Camino más corto desde `source` a todos los nodos: distancia y nodo anterior (-1 = sin camino). */
function shortestFrom(aug: Augmented, source: number): { dist: Float64Array; prev: Int32Array } {
  const dist = new Float64Array(aug.adjacency.length).fill(Infinity)
  const prev = new Int32Array(aug.adjacency.length).fill(-1)
  dist[source] = 0
  const heap = new MinHeap()
  heap.push([0, source])
  while (heap.size > 0) {
    const [d, u] = heap.pop()
    if (d > dist[u]) continue
    for (const [v, w] of aug.adjacency[u]) {
      const nd = d + w
      if (nd < dist[v]) {
        dist[v] = nd
        prev[v] = u
        heap.push([nd, v])
      }
    }
  }
  return { dist, prev }
}

/**
 * Distancias en km POR CALLE entre todos los `points` (matriz [desde][hasta]; ida y vuelta pueden diferir
 * por las manos únicas). null donde no se puede medir: punto lejos de toda calle del mapa o sin camino
 * posible respetando las manos. Cada punto se ubica sobre la calle más cercana.
 */
export function streetDistances(graph: StreetGraph, points: Point[]): (number | null)[][] {
  const aug = augment(graph, points)
  return points.map((_, from) => {
    const row: (number | null)[] = points.map(() => null)
    if (!aug.snaps[from]) return row
    const { dist } = shortestFrom(aug, aug.base + from)
    for (let to = 0; to < points.length; to++) {
      if (to === from) row[to] = 0
      else if (aug.snaps[to] && dist[aug.base + to] < Infinity) row[to] = dist[aug.base + to]
    }
    return row
  })
}

/**
 * Camino por calle, esquina por esquina ([lat, lng] desde el punto de salida hasta el de llegada), de cada
 * tramo pedido en `legs` ([índice desde, índice hasta] sobre `points`). null donde no hay camino por calle.
 */
export function streetPaths(
  graph: StreetGraph,
  points: Point[],
  legs: [number, number][],
): ([number, number][] | null)[] {
  const aug = augment(graph, points)
  const bySource = new Map<number, Int32Array>()
  return legs.map(([from, to]) => {
    if (!aug.snaps[from] || !aug.snaps[to]) return null
    let prev = bySource.get(from)
    if (!prev) {
      prev = shortestFrom(aug, aug.base + from).prev
      bySource.set(from, prev)
    }
    const source = aug.base + from
    const path: [number, number][] = []
    for (let node = aug.base + to; node !== -1; node = node === source ? -1 : prev[node]) {
      path.push(aug.coord(node))
      if (node !== source && prev[node] === -1) return null // sin camino
    }
    return path.reverse()
  })
}
