import "server-only"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"

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
