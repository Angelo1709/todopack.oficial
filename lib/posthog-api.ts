import "server-only"
import { FUNNEL_EVENTS, EVENTS } from "@/lib/analytics-events"
import { isIsoDate } from "@/lib/dates"

// Visitas y embudo de la tienda para el panel de métricas, leídos con la API de consultas de PostHog
// (docs/metricas-posthog.md). Necesita una clave personal con permiso "Query: Read" en
// POSTHOG_PERSONAL_API_KEY y el id del proyecto en POSTHOG_PROJECT_ID. La clave nunca sale del servidor.

export type TrafficItem = { label: string; value: number }

export type Traffic = {
  /** Personas distintas por paso del embudo: visitó, agregó al carrito, inició el checkout, confirmó. */
  funnel: number[]
  /** Visitantes únicos por día ("yyyy-mm-dd"). */
  perDay: Record<string, number>
  devices: TrafficItem[]
  /** Sitio de origen (`$direct` = entró directo). */
  origins: TrafficItem[]
  /** Búsquedas con 0 resultados y cuántas veces se hicieron. */
  emptySearches: TrafficItem[]
}

export type TrafficResult = { ok: true; data: Traffic; fetchedAt: number } | { ok: false; error: string }

type Config = { key: string; projectId: string; host: string }

function config(): Config | null {
  const key = process.env.POSTHOG_PERSONAL_API_KEY?.trim()
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim()
  if (!key || !projectId || !/^\d+$/.test(projectId)) return null
  const region = process.env.NEXT_PUBLIC_POSTHOG_REGION === "eu" ? "eu" : "us"
  // POSTHOG_API_HOST: instancias propias o pruebas locales.
  const host = (process.env.POSTHOG_API_HOST?.trim() || `https://${region}.posthog.com`).replace(/\/+$/, "")
  return { key, projectId, host }
}

/** Link al proyecto en PostHog (para "Ver más en PostHog"), o null si no está configurado. */
export function posthogProjectUrl(): string | null {
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim()
  if (!projectId || !/^\d+$/.test(projectId)) return null
  const region = process.env.NEXT_PUBLIC_POSTHOG_REGION === "eu" ? "eu" : "us"
  return `https://${region}.posthog.com/project/${projectId}`
}

// Mismo criterio que el tablero de PostHog: las pruebas en la compu (localhost) no cuentan.
const HOST_FILTER = { key: "$host", type: "event", operator: "not_icontains", value: "localhost" }
const HOGQL_NOT_LOCAL = "properties.$host NOT ILIKE '%localhost%'"

class PostHogApiError extends Error {}

function errorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "PostHog rechazó la clave: revisá que POSTHOG_PERSONAL_API_KEY sea válida, tenga permiso «Query: Read» y acceso a este proyecto."
  }
  if (status === 404) return "PostHog no encontró el proyecto: revisá POSTHOG_PROJECT_ID."
  if (status === 429) return "PostHog limitó las consultas por un rato. Probá de nuevo en unos minutos."
  return `PostHog no respondió bien (código ${status}). Probá de nuevo en unos minutos.`
}

async function runQuery(cfg: Config, name: string, query: object): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${cfg.host}/api/projects/${cfg.projectId}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, name }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError"
    throw new PostHogApiError(timeout ? "PostHog tardó demasiado en responder. Probá de nuevo en unos minutos." : "No se pudo conectar con PostHog.")
  }
  if (!res.ok) throw new PostHogApiError(errorMessage(res.status))
  return ((await res.json()) as { results?: unknown }).results
}

function funnelQuery(from: string, to: string) {
  return {
    kind: "FunnelsQuery",
    series: FUNNEL_EVENTS.map((event) => ({ kind: "EventsNode", event })),
    dateRange: { date_from: from, date_to: to },
    properties: [HOST_FILTER],
    funnelsFilter: { funnelOrderType: "ordered", funnelWindowInterval: 1, funnelWindowIntervalUnit: "day" },
    filterTestAccounts: false,
  }
}

/** Una sola consulta para visitantes por día, dispositivo, origen y búsquedas sin resultados. */
function breakdownQuery(from: string, to: string, days: number) {
  // `timestamp >= now() - N` aprovecha el índice; `toDate(timestamp)` (zona del proyecto) recorta exacto.
  const range = `timestamp >= now() - INTERVAL ${days + 2} DAY AND toDate(timestamp) >= toDate('${from}') AND toDate(timestamp) <= toDate('${to}')`
  const pageviews = `event = '$pageview' AND ${range} AND ${HOGQL_NOT_LOCAL}`
  return {
    kind: "HogQLQuery",
    query: `
      SELECT 'dia' AS kind, toString(toDate(timestamp)) AS label, uniq(person_id) AS total
      FROM events WHERE ${pageviews}
      GROUP BY label
      UNION ALL
      SELECT 'dispositivo' AS kind, coalesce(properties.$device_type, '') AS label, uniq(person_id) AS total
      FROM events WHERE ${pageviews}
      GROUP BY label
      UNION ALL
      SELECT 'origen' AS kind, coalesce(properties.$referring_domain, '') AS label, uniq(person_id) AS total
      FROM events WHERE ${pageviews} AND coalesce(properties.$referring_domain, '') != coalesce(properties.$host, '')
      GROUP BY label
      UNION ALL
      SELECT 'busqueda' AS kind, lower(trim(coalesce(properties.query, ''))) AS label, count() AS total
      FROM events
      WHERE event = '${EVENTS.productsSearched}' AND ${range} AND ${HOGQL_NOT_LOCAL} AND toInt(properties.results) = 0
      GROUP BY label
      ORDER BY kind, total DESC
      LIMIT 500`,
  }
}

function parseFunnel(results: unknown): number[] {
  // Sin desglose: un paso por elemento, con `order` y `count`. Con desglose vendría un nivel más.
  const steps = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results
  if (!Array.isArray(steps)) return FUNNEL_EVENTS.map(() => 0)
  const counts = FUNNEL_EVENTS.map(() => 0)
  steps.forEach((step: { order?: unknown; count?: unknown }, index) => {
    const order = typeof step?.order === "number" ? step.order : index
    if (order >= 0 && order < counts.length) counts[order] = Number(step?.count) || 0
  })
  return counts
}

function parseBreakdowns(results: unknown): Omit<Traffic, "funnel"> {
  const traffic: Omit<Traffic, "funnel"> = { perDay: {}, devices: [], origins: [], emptySearches: [] }
  if (!Array.isArray(results)) return traffic
  for (const row of results) {
    if (!Array.isArray(row)) continue
    const [kind, rawLabel, rawTotal] = row
    const label = String(rawLabel ?? "")
    const value = Number(rawTotal) || 0
    if (kind === "dia") traffic.perDay[label] = value
    else if (kind === "dispositivo") traffic.devices.push({ label, value })
    else if (kind === "origen") traffic.origins.push({ label, value })
    else if (kind === "busqueda" && label) traffic.emptySearches.push({ label, value })
  }
  return traffic
}

async function loadTraffic(cfg: Config, from: string, to: string, days: number): Promise<TrafficResult> {
  try {
    const [funnel, breakdowns] = await Promise.all([
      runQuery(cfg, "todopack-admin-embudo", funnelQuery(from, to)),
      runQuery(cfg, "todopack-admin-visitas", breakdownQuery(from, to, days)),
    ])
    return { ok: true, data: { funnel: parseFunnel(funnel), ...parseBreakdowns(breakdowns) }, fetchedAt: Date.now() }
  } catch (err) {
    if (!(err instanceof PostHogApiError)) console.error("Métricas PostHog:", err)
    return { ok: false, error: err instanceof PostHogApiError ? err.message : "No se pudieron leer las métricas de PostHog." }
  }
}

// Caché en memoria: el panel se puede recargar seguido sin gastar el cupo de consultas de PostHog.
const TTL_MS = 10 * 60_000
const ERROR_TTL_MS = 60_000
const cache = new Map<string, { at: number; ttl: number; promise: Promise<TrafficResult> }>()

/** null = PostHog no está configurado en el servidor. */
export async function getStoreTraffic(from: string, to: string, days: number): Promise<TrafficResult | null> {
  const cfg = config()
  if (!cfg) return null
  if (!isIsoDate(from) || !isIsoDate(to)) return { ok: false, error: "Período inválido." }

  const now = Date.now()
  for (const [key, entry] of cache) if (now - entry.at > entry.ttl) cache.delete(key)
  const key = `${from}|${to}`
  const hit = cache.get(key)
  if (hit) return hit.promise

  const entry = { at: now, ttl: TTL_MS, promise: loadTraffic(cfg, from, to, days) }
  cache.set(key, entry)
  const result = await entry.promise
  if (!result.ok) entry.ttl = ERROR_TTL_MS
  return result
}
