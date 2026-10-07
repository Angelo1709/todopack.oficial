"use server"

import { sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import { getDeliverySettings } from "@/lib/settings"
import { DELIVERY_SETTING_KEYS, validateDeliverySettings, type DeliverySettings, type DeliverySettingErrors } from "@/lib/delivery-schedule"

export type DeliverySettingsResult = {ok:true;values:DeliverySettings} | {ok:false;error:string;fieldErrors?:DeliverySettingErrors}

/** Configuración pública y reloj del servidor; no expone datos bancarios ni de usuarios. */
export async function getDeliveryBookingData() {
  const values=await getDeliverySettings()
  return {values,now:Date.now()}
}

export async function updateDeliverySettings(input:Record<string,unknown>):Promise<DeliverySettingsResult> {
  try { await requireAdmin() }
  catch { return {ok:false,error:"Tu sesión no tiene permisos de administrador. Volvé a ingresar."} }
  const result=validateDeliverySettings(input && typeof input==="object" ? input : {})
  if (!result.ok) return {ok:false,error:"Revisá los horarios marcados.",fieldErrors:result.errors}
  const now=new Date()
  await db.insert(settings).values(DELIVERY_SETTING_KEYS.map(key=>({key,value:result.values[key],updatedAt:now})))
    .onConflictDoUpdate({target:settings.key,set:{value:sql`excluded.value`,updatedAt:now}})
  revalidatePath("/admin/configuracion")
  revalidatePath("/checkout")
  return {ok:true,values:result.values}
}
