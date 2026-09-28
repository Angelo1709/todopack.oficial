import "server-only"
import { inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { isRouteEnd, isRoutePlace, parseLatLng, type RouteConfig } from "@/lib/route"

// Valores por defecto hasta que el admin los cargue en /admin/configuracion.
export const SETTINGS_DEFAULTS = {
  whatsappNumber: "",
  bankAlias: "todopack.alcorta",
  bankCbu: "",
  bankHolder: "TodoPack Alcorta",
} as const

export type SettingKey = keyof typeof SETTINGS_DEFAULTS
export type Settings = Record<SettingKey, string>

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS) as SettingKey[]

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settings)
  const result: Settings = { ...SETTINGS_DEFAULTS }
  for (const row of rows) {
    if (row.key in SETTINGS_DEFAULTS) result[row.key as SettingKey] = row.value
  }
  return result
}

// ---- Recorrido de reparto (se guarda aparte: tiene su propio formulario en /admin/configuracion) ----

// Ubicaciones como "lat,lng" (formatLatLng); vacías hasta que el admin las carga.
export const ROUTE_SETTINGS_DEFAULTS = {
  routeCity: "Alcorta, Santa Fe",
  localAddress: "",
  localLocation: "",
  depotAddress: "",
  depotLocation: "",
  routeStart: "deposito",
  routeEnd: "deposito",
} as const

export type RouteSettingKey = keyof typeof ROUTE_SETTINGS_DEFAULTS
export type RouteSettingsValues = Record<RouteSettingKey, string>

export const ROUTE_SETTING_KEYS = Object.keys(ROUTE_SETTINGS_DEFAULTS) as RouteSettingKey[]

export async function getRouteSettings(): Promise<RouteSettingsValues> {
  const rows = await db.select().from(settings).where(inArray(settings.key, ROUTE_SETTING_KEYS))
  const result: RouteSettingsValues = { ...ROUTE_SETTINGS_DEFAULTS }
  for (const row of rows) result[row.key as RouteSettingKey] = row.value
  return result
}

function routeConfigFrom(values: RouteSettingsValues): RouteConfig {
  return {
    city: values.routeCity.trim(),
    places: {
      local: { address: values.localAddress.trim(), location: parseLatLng(values.localLocation) },
      deposito: { address: values.depotAddress.trim(), location: parseLatLng(values.depotLocation) },
    },
    start: isRoutePlace(values.routeStart) ? values.routeStart : ROUTE_SETTINGS_DEFAULTS.routeStart,
    end: isRouteEnd(values.routeEnd) ? values.routeEnd : ROUTE_SETTINGS_DEFAULTS.routeEnd,
  }
}

export async function getRouteConfig(): Promise<RouteConfig> {
  return routeConfigFrom(await getRouteSettings())
}

// ---- Sincronización con el sistema del local (pantalla /admin/sistema) ----

export const SYNC_SETTINGS_DEFAULTS = {
  // Mientras está en "false" el stock sólo se ve en el panel; la tienda vende todo.
  stockInStore: "false",
  // El precio de la tienda lo manda el sistema del local (neto + IVA).
  pricesFromSystem: "true",
  // SHA-256 (hex) de la clave que usa el script de la PC. Vacía = sincronización desactivada.
  syncKeyHash: "",
} as const

export type SyncSettingKey = keyof typeof SYNC_SETTINGS_DEFAULTS
export const SYNC_SETTING_KEYS = Object.keys(SYNC_SETTINGS_DEFAULTS) as SyncSettingKey[]

export type SyncConfig = { stockInStore: boolean; pricesFromSystem: boolean; syncKeyHash: string }

export async function getSyncConfig(): Promise<SyncConfig> {
  const rows = await db.select().from(settings).where(inArray(settings.key, SYNC_SETTING_KEYS))
  const values: Record<SyncSettingKey, string> = { ...SYNC_SETTINGS_DEFAULTS }
  for (const row of rows) values[row.key as SyncSettingKey] = row.value
  return {
    stockInStore: values.stockInStore === "true",
    pricesFromSystem: values.pricesFromSystem === "true",
    syncKeyHash: values.syncKeyHash,
  }
}
