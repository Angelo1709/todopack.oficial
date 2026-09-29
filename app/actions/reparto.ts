"use server"

import { sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { isPanelDate, orderLabel } from "@/lib/admin-orders-utils"
import { geocodeAddress, resolveShortMapsLink } from "@/lib/geocode"
import { locatePendingOrders, setOrderLocation, type LocateSummary } from "@/lib/order-location"
import {
  ROUTE_PLACE_LABEL,
  formatLatLng,
  isRouteEnd,
  isRoutePlace,
  isShortMapsLink,
  isValidLatLng,
  parseLatLng,
  referencePoint,
  type LatLng,
  type RoutePlace,
} from "@/lib/route"
import { requireAdmin } from "@/lib/session"
import { refreshStreetMap } from "@/lib/street-map"
import {
  ROUTE_SETTING_KEYS,
  getRouteConfig,
  type RouteSettingKey,
  type RouteSettingsValues,
} from "@/lib/settings"

const NOT_ADMIN = "Tu sesión no tiene permisos de administrador. Volvé a ingresar."

async function isAdmin() {
  try {
    await requireAdmin()
    return true
  } catch {
    return false
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

// ---- Buscar una ubicación (dirección, coordenadas o link de Google Maps) ----

export type FoundLocation = {
  location: LatLng
  /** exacta: la casa · aproximada: sólo la calle o la zona · manual: coordenadas pegadas. */
  precision: "exacta" | "aproximada" | "manual"
  label: string
}

export type FindLocationResult = { ok: true; found: FoundLocation } | { ok: false; error: string }

export async function findLocation(query: string): Promise<FindLocationResult> {
  if (!(await isAdmin())) return { ok: false, error: NOT_ADMIN }
  const q = text(query).slice(0, 500)
  if (!q) return { ok: false, error: "Escribí una dirección o pegá las coordenadas." }

  const pasted = parseLatLng(q)
  if (pasted) return { ok: true, found: { location: pasted, precision: "manual", label: "" } }

  if (isShortMapsLink(q)) {
    const resolved = await resolveShortMapsLink(q)
    if (resolved) {
      return { ok: true, found: { location: resolved, precision: "manual", label: "Punto del link de Google Maps" } }
    }
    return {
      ok: false,
      error: "No pudimos leer ese link. Abrilo en Google Maps, tocá el punto y copiá las coordenadas (ej.: -33.5321, -61.1234).",
    }
  }
  if (/^https?:\/\//i.test(q)) {
    return { ok: false, error: "Ese link no tiene coordenadas. Pegá las coordenadas del punto (ej.: -33.5321, -61.1234)." }
  }

  const config = await getRouteConfig()
  const result = await geocodeAddress(q, { city: config.city, near: referencePoint(config) })
  if (result.ok) {
    return { ok: true, found: { location: result.location, precision: result.precision, label: result.label } }
  }
  return {
    ok: false,
    error:
      result.reason === "error"
        ? "No pudimos consultar el mapa. Probá de nuevo en un rato."
        : "No encontramos esa dirección en el mapa. Probá con calle y número, o pegá las coordenadas desde Google Maps.",
  }
}

// ---- Ubicación de los pedidos ----

export type LocateOrdersResult = { ok: true; summary: LocateSummary } | { ok: false; error: string }

/** Busca en el mapa los pedidos de `date` que todavía no tienen ubicación. */
export async function locateOrdersForDate(date: string): Promise<LocateOrdersResult> {
  if (!(await isAdmin())) return { ok: false, error: NOT_ADMIN }
  if (!isPanelDate(date)) return { ok: false, error: "Fecha inválida" }
  const summary = await locatePendingOrders(date)
  revalidatePath("/admin")
  return { ok: true, summary }
}

export type SaveLocationResult = { ok: true } | { ok: false; error: string }

export async function saveOrderLocation(orderId: number, location: LatLng): Promise<SaveLocationResult> {
  if (!(await isAdmin())) return { ok: false, error: NOT_ADMIN }
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  if (!Number.isInteger(orderId) || !isValidLatLng(lat, lng)) return { ok: false, error: "Ubicación inválida" }
  const saved = await setOrderLocation(orderId, { lat, lng })
  if (!saved) return { ok: false, error: `El pedido ${orderLabel(orderId)} no existe` }
  revalidatePath("/admin")
  return { ok: true }
}

// ---- Configuración del recorrido ----

export type RouteSettingsResult =
  | { ok: true; values: RouteSettingsValues }
  | { ok: false; error: string; fieldErrors?: Partial<Record<RouteSettingKey, string>> }

const LOCATION_KEY: Record<RoutePlace, RouteSettingKey> = { local: "localLocation", deposito: "depotLocation" }
const ADDRESS_KEY: Record<RoutePlace, RouteSettingKey> = { local: "localAddress", deposito: "depotAddress" }

export async function updateRouteSettings(input: Record<string, unknown>): Promise<RouteSettingsResult> {
  if (!(await isAdmin())) return { ok: false, error: NOT_ADMIN }
  const data = input && typeof input === "object" ? input : {}
  const errors: Partial<Record<RouteSettingKey, string>> = {}

  const routeCity = text(data.routeCity).replace(/\s+/g, " ")
  if (routeCity.length > 80) errors.routeCity = "La localidad puede tener hasta 80 caracteres."

  const values = { routeCity } as RouteSettingsValues
  for (const place of ["local", "deposito"] as const) {
    const address = text(data[ADDRESS_KEY[place]]).replace(/\s+/g, " ")
    if (address.length > 200) errors[ADDRESS_KEY[place]] = "La dirección puede tener hasta 200 caracteres."
    const raw = text(data[LOCATION_KEY[place]])
    const location = raw ? parseLatLng(raw) : null
    if (raw && !location) errors[LOCATION_KEY[place]] = "Ubicación inválida: volvé a buscarla en el mapa."
    values[ADDRESS_KEY[place]] = address
    values[LOCATION_KEY[place]] = location ? formatLatLng(location) : ""
  }

  const routeStart = text(data.routeStart)
  const routeEnd = text(data.routeEnd)
  if (!isRoutePlace(routeStart)) errors.routeStart = "Elegí de dónde sale el auto."
  if (!isRouteEnd(routeEnd)) errors.routeEnd = "Elegí dónde termina el recorrido."
  values.routeStart = routeStart
  values.routeEnd = routeEnd

  // Los puntos que se usan (salida y llegada) tienen que estar ubicados en el mapa.
  if (isRoutePlace(routeStart) && !values[LOCATION_KEY[routeStart]] && !errors[LOCATION_KEY[routeStart]]) {
    errors[LOCATION_KEY[routeStart]] =
      `Ubicá el ${ROUTE_PLACE_LABEL[routeStart].toLowerCase()} en el mapa: es el punto de salida.`
  }
  if (isRoutePlace(routeEnd) && !values[LOCATION_KEY[routeEnd]] && !errors[LOCATION_KEY[routeEnd]]) {
    errors[LOCATION_KEY[routeEnd]] =
      `Ubicá el ${ROUTE_PLACE_LABEL[routeEnd].toLowerCase()} en el mapa: es donde termina el recorrido.`
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: errors }
  }

  const now = new Date()
  await db
    .insert(settings)
    .values(ROUTE_SETTING_KEYS.map((key) => ({ key, value: values[key], updatedAt: now })))
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: now } })

  revalidatePath("/admin/configuracion")
  revalidatePath("/admin")
  return { ok: true, values }
}

// ---- Mapa de calles (OpenStreetMap) ----

export type StreetMapResult =
  | { ok: true; info: { fetchedAt: string; ways: number; oneWays: number } }
  | { ok: false; error: string }

/** Baja de nuevo las calles de la zona desde OpenStreetMap (por ejemplo, después de corregir manos). */
export async function refreshStreetMapAction(): Promise<StreetMapResult> {
  if (!(await isAdmin())) return { ok: false, error: NOT_ADMIN }
  const result = await refreshStreetMap(await getRouteConfig())
  if (!result.ok) return result
  revalidatePath("/admin/configuracion")
  revalidatePath("/admin")
  const { fetchedAt, ways, oneWays } = result.info
  return { ok: true, info: { fetchedAt: fetchedAt.toISOString(), ways, oneWays } }
}
