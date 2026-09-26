"use server"

import { sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import { SETTING_KEYS, type SettingKey, type Settings } from "@/lib/settings"
import { normalizeWhatsAppNumber } from "@/lib/whatsapp"

export type SettingsResult =
  | { ok: true; values: Settings }
  | { ok: false; error: string; fieldErrors?: Partial<Record<SettingKey, string>> }

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

/** Guarda WhatsApp y datos bancarios (tabla `settings`). Devuelve los valores ya normalizados. */
export async function updateSettings(input: Record<string, unknown>): Promise<SettingsResult> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, error: "Tu sesión no tiene permisos de administrador. Volvé a ingresar." }
  }

  const data = input && typeof input === "object" ? input : {}
  const errors: Partial<Record<SettingKey, string>> = {}

  const whatsappRaw = text(data.whatsappNumber)
  const whatsappNumber = whatsappRaw ? normalizeWhatsAppNumber(whatsappRaw) : ""
  if (whatsappRaw && (whatsappNumber.length < 11 || whatsappNumber.length > 15)) {
    errors.whatsappNumber = "Revisá el número: va con código de país y de área, por ejemplo 5493415551234."
  }

  const bankAlias = text(data.bankAlias)
  if (bankAlias && !/^[a-zA-Z0-9.-]{6,20}$/.test(bankAlias)) {
    errors.bankAlias = "El alias tiene entre 6 y 20 caracteres: letras, números, puntos o guiones (sin espacios)."
  }

  const cbuRaw = text(data.bankCbu)
  const bankCbu = cbuRaw.replace(/[\s.-]/g, "")
  if (bankCbu && !/^\d{22}$/.test(bankCbu)) {
    errors.bankCbu = `El CBU o CVU tiene que tener 22 números (cargaste ${bankCbu.replace(/\D/g, "").length}).`
  }

  if (!bankAlias && !bankCbu && !errors.bankAlias && !errors.bankCbu) {
    errors.bankAlias = "Cargá al menos el alias o el CBU para que los clientes puedan transferirte."
  }

  const bankHolder = text(data.bankHolder).replace(/\s+/g, " ")
  if (bankHolder.length > 80) errors.bankHolder = "El titular puede tener hasta 80 caracteres."

  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: errors }
  }

  const values: Settings = { whatsappNumber, bankAlias, bankCbu, bankHolder }
  const now = new Date()
  await db
    .insert(settings)
    .values(SETTING_KEYS.map((key) => ({ key, value: values[key], updatedAt: now })))
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: now } })

  revalidatePath("/checkout")
  revalidatePath("/admin/configuracion")
  // El comprobante por WhatsApp y los datos bancarios también se muestran en el pedido del cliente.
  revalidatePath("/pedido/[token]", "page")
  return { ok: true, values }
}
