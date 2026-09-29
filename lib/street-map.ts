import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { streetMap } from "@/lib/db/schema"
import type { RouteConfig } from "@/lib/route"
import { buildStreetGraph, DRIVABLE_HIGHWAYS, type OsmElement, type StreetGraph } from "@/lib/street-graph"

// Mapa de calles de la zona, bajado de OpenStreetMap con la API Overpass (gratis). Se guarda en la base
// (tabla street_map) y se actualiza a mano desde /admin/configuracion: así, lo que se corrige en
// OpenStreetMap (por ejemplo, las manos de las calles) llega al recorrido cuando el admin lo pide.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter"
const USER_AGENT = "TodoPackAlcorta/1.0 (recorrido de reparto)"
const TIMEOUT_MS = 90_000
/** Margen alrededor del local y el depósito, en grados (≈ 4,5 km): cubre el pueblo y sus alrededores. */
const MARGIN_LAT = 0.04
const MARGIN_LNG = 0.045

export type StreetMapInfo = { fetchedAt: Date; ways: number; oneWays: number; bbox: string }

// El grafo se lee de la base sólo cuando cambia (se compara la fecha de descarga).
let cache: { fetchedAt: number; graph: StreetGraph } | null = null

/** Zona a bajar: rectángulo alrededor del local y el depósito (los que estén ubicados). */
function bboxFor(config: RouteConfig): [number, number, number, number] | null {
  const points = [config.places.local.location, config.places.deposito.location].filter((p) => p !== null)
  if (points.length === 0) return null
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  return [
    Math.min(...lats) - MARGIN_LAT,
    Math.min(...lngs) - MARGIN_LNG,
    Math.max(...lats) + MARGIN_LAT,
    Math.max(...lngs) + MARGIN_LNG,
  ]
}

export type RefreshResult = { ok: true; info: StreetMapInfo } | { ok: false; error: string }

/** Baja de nuevo las calles de la zona desde OpenStreetMap y reemplaza el mapa guardado. */
export async function refreshStreetMap(config: RouteConfig): Promise<RefreshResult> {
  const bbox = bboxFor(config)
  if (!bbox) return { ok: false, error: "Primero ubicá en el mapa el local o el depósito (más arriba)." }
  const area = bbox.map((n) => n.toFixed(5)).join(",")
  const query = `[out:json][timeout:80];way["highway"~"^(${DRIVABLE_HIGHWAYS.join("|")})$"](${area});(._;>;);out body qt;`

  let elements: OsmElement[]
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`Overpass respondió ${res.status}`)
    const json = (await res.json()) as { elements?: OsmElement[] }
    elements = Array.isArray(json.elements) ? json.elements : []
  } catch (err) {
    console.error("[mapa de calles]", err instanceof Error ? err.message : err)
    return { ok: false, error: "No pudimos bajar las calles de OpenStreetMap. Probá de nuevo en unos minutos." }
  }

  const { graph, ways, oneWays } = buildStreetGraph(elements)
  if (ways === 0) return { ok: false, error: "OpenStreetMap no devolvió calles para la zona del local." }

  const info: StreetMapInfo = { fetchedAt: new Date(), ways, oneWays, bbox: area }
  await db
    .insert(streetMap)
    .values({ id: 1, ...info, graph })
    .onConflictDoUpdate({ target: streetMap.id, set: { ...info, graph } })
  cache = { fetchedAt: info.fetchedAt.getTime(), graph }
  return { ok: true, info }
}

export async function getStreetMapInfo(): Promise<StreetMapInfo | null> {
  const [row] = await db
    .select({ fetchedAt: streetMap.fetchedAt, ways: streetMap.ways, oneWays: streetMap.oneWays, bbox: streetMap.bbox })
    .from(streetMap)
    .where(eq(streetMap.id, 1))
  return row ?? null
}

/** Grafo de calles guardado, o null si todavía no se bajó. */
export async function getStreetGraph(): Promise<StreetGraph | null> {
  const info = await getStreetMapInfo()
  if (!info) return null
  if (cache?.fetchedAt === info.fetchedAt.getTime()) return cache.graph
  const [row] = await db.select({ graph: streetMap.graph }).from(streetMap).where(eq(streetMap.id, 1))
  if (!row) return null
  cache = { fetchedAt: info.fetchedAt.getTime(), graph: row.graph }
  return row.graph
}
