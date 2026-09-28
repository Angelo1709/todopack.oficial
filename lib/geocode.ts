import "server-only"
import { isShortMapsLink, isValidLatLng, parseLatLng, type LatLng } from "@/lib/route"

// Direcciones -> coordenadas con Nominatim (OpenStreetMap), gratis y sin API key.
// Política de uso: identificarse, como máximo 1 pedido por segundo y guardar los resultados
// (cada pedido se busca una sola vez: queda en orders.lat/lng).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
const USER_AGENT = "TodoPackAlcorta/1.0 (recorrido de reparto)"
const MIN_INTERVAL_MS = 1100
const TIMEOUT_MS = 8000
/** Radio de búsqueda alrededor del local/depósito (en grados, ≈ 30 km). */
const AREA_DEGREES = 0.3

let queue: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

/** Encola `fn` para que entre dos pedidos a Nominatim pase al menos MIN_INTERVAL_MS. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
    return fn()
  })
  queue = run.catch(() => {})
  return run
}

export type GeocodeResult =
  | { ok: true; location: LatLng; precision: "exacta" | "aproximada"; label: string }
  | { ok: false; reason: "no_encontrada" | "error" }

type NominatimPlace = {
  lat: string
  lon: string
  display_name?: string
  address?: { house_number?: string }
}

function withoutAccents(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** Saca piso, depto y aclaraciones que confunden al buscador: "Belgrano 450 piso 2 dto B" -> "Belgrano 450". */
function simplifyAddress(address: string) {
  return address
    .replace(/\s*[,(-]?\s*\b(piso|dpto|depto|dto|departamento|timbre|casa|entre|esq|esquina)\b.*$/i, "")
    .trim()
}

async function search(query: string, near: LatLng | null): Promise<NominatimPlace | null> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
    countrycodes: "ar",
    "accept-language": "es",
  })
  if (near) {
    // Sólo resultados cerca del negocio: evita que "San Martín 450" aparezca en otra ciudad.
    params.set(
      "viewbox",
      [near.lng - AREA_DEGREES, near.lat + AREA_DEGREES, near.lng + AREA_DEGREES, near.lat - AREA_DEGREES].join(","),
    )
    params.set("bounded", "1")
  }
  const res = await throttled(() =>
    fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    }),
  )
  if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`)
  const places = (await res.json()) as NominatimPlace[]
  return Array.isArray(places) && places.length > 0 ? places[0] : null
}

/**
 * Busca `address` en el mapa. `city` se agrega si la dirección no la menciona; `near` (local o depósito)
 * limita la búsqueda a la zona. "exacta" si encontró la casa (número de puerta), "aproximada" si sólo
 * la calle o el barrio. Los errores de red devuelven reason "error" (conviene reintentar más tarde).
 */
export async function geocodeAddress(
  address: string,
  { city, near }: { city: string; near: LatLng | null },
): Promise<GeocodeResult> {
  const withCity = (text: string) =>
    city && !withoutAccents(text).includes(withoutAccents(city.split(",")[0])) ? `${text}, ${city}` : text
  const queries = [...new Set([withCity(address.trim()), withCity(simplifyAddress(address))])].filter(
    (q) => q.replace(/[\s,]/g, "").length > 0,
  )

  try {
    for (const query of queries) {
      const place = await search(query, near)
      if (!place) continue
      const location = { lat: Number(place.lat), lng: Number(place.lon) }
      if (!isValidLatLng(location.lat, location.lng)) continue
      return {
        ok: true,
        location,
        precision: place.address?.house_number ? "exacta" : "aproximada",
        label: place.display_name ?? query,
      }
    }
    return { ok: false, reason: "no_encontrada" }
  } catch (err) {
    console.error("[geocode]", err instanceof Error ? err.message : err)
    return { ok: false, reason: "error" }
  }
}

// Hosts por los que se deja seguir un link corto (no se abre cualquier URL que pegue el admin).
const SHORT_LINK_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.com(\.ar)?|consent\.google\.com)$/i

/** Abre un link corto de Google Maps (maps.app.goo.gl/...) y lee las coordenadas del link largo. */
export async function resolveShortMapsLink(link: string): Promise<LatLng | null> {
  if (!isShortMapsLink(link)) return null
  let url = link.trim()
  try {
    for (let hop = 0; hop < 4; hop++) {
      const host = new URL(url).hostname
      if (!SHORT_LINK_HOSTS.test(host)) return null
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
      const next = res.headers.get("location")
      if (!next) return null
      url = new URL(next, url).toString()
      const found = parseLatLng(url)
      if (found) return found
    }
  } catch (err) {
    console.error("[geocode] link corto", err instanceof Error ? err.message : err)
  }
  return null
}
