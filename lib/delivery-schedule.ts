import { AR_TIME_ZONE, addDays } from "./dates.ts"
import { DELIVERY_SLOTS, DELIVERY_SLOT_LABEL, type DeliverySlot } from "./order-status.ts"

export const DELIVERY_SETTINGS_DEFAULTS = {
  deliveryMiddayStart: "12:00",
  deliveryMiddayEnd: "15:00",
  deliveryNightStart: "19:00",
  deliveryNightEnd: "22:00",
  deliveryLeadMinutes: "60",
} as const
export type DeliverySettingKey = keyof typeof DELIVERY_SETTINGS_DEFAULTS
export type DeliverySettings = Record<DeliverySettingKey,string>
export const DELIVERY_SETTING_KEYS = Object.keys(DELIVERY_SETTINGS_DEFAULTS) as DeliverySettingKey[]
export type DeliverySettingErrors = Partial<Record<DeliverySettingKey,string>>

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const minute = (s:string) => Number(s.slice(0,2))*60+Number(s.slice(3))
const SLOT_KEYS = {
  mediodia: ["deliveryMiddayStart","deliveryMiddayEnd"],
  noche: ["deliveryNightStart","deliveryNightEnd"],
} as const

export function validateDeliverySettings(input:Record<string,unknown>) {
  const values = {} as DeliverySettings
  const errors:DeliverySettingErrors = {}
  for (const key of DELIVERY_SETTING_KEYS) {
    values[key] = typeof input[key] === "string" ? input[key].trim() : ""
    if (key !== "deliveryLeadMinutes" && !TIME_RE.test(values[key])) errors[key] = "Ingresá una hora válida (HH:MM)."
  }
  const lead=values.deliveryLeadMinutes
  if (!/^\d+$/.test(lead) || Number(lead)>10080) errors.deliveryLeadMinutes="Ingresá entre 0 y 10.080 minutos (hasta 7 días)."
  else values.deliveryLeadMinutes=String(Number(lead))
  if (!Object.keys(errors).length) {
    const [ms,me,ns,ne]=[values.deliveryMiddayStart,values.deliveryMiddayEnd,values.deliveryNightStart,values.deliveryNightEnd].map(minute)
    if (me<=ms) errors.deliveryMiddayEnd="El final del mediodía debe ser posterior al inicio."
    if (ns<me) errors.deliveryNightStart="La noche debe comenzar después de que termine el mediodía."
    if (ne===ns || (ne<ns && ne>ms)) errors.deliveryNightEnd="La noche debe terminar sin superponerse con el próximo mediodía."
  }
  return {values,errors,ok:Object.keys(errors).length===0}
}

const dateFormat=new Intl.DateTimeFormat("en-CA",{timeZone:AR_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"})
const partsFormat=new Intl.DateTimeFormat("en-CA",{timeZone:AR_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"})
export const dateInArgentina=(now:number) => dateFormat.format(new Date(now))
export function validDeliveryDate(date:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d=new Date(`${date}T12:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===date
}

/** Resuelve una fecha/hora argentina usando la zona, independientemente del reloj del servidor. */
export function deliveryInstant(date:string,time:string):number {
  if (!validDeliveryDate(date) || !TIME_RE.test(time)) return NaN
  const target=Date.parse(`${date}T${time}:00Z`)
  let result=target
  for (let i=0;i<2;i++) {
    const parts=Object.fromEntries(partsFormat.formatToParts(new Date(result)).map(p=>[p.type,p.value]))
    const wall=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
    result+=target-wall
  }
  return result
}

export function deliveryWindow(settings:DeliverySettings,slot:DeliverySlot) {
  const [start,end]=SLOT_KEYS[slot]
  return `${settings[start]}–${settings[end]}${settings[end]<=settings[start] ? " (termina al día siguiente)" : ""}`
}
export function deliveryCutoff(settings:DeliverySettings,date:string,slot:DeliverySlot) {
  return deliveryInstant(date,settings[SLOT_KEYS[slot][0]])-Number(settings.deliveryLeadMinutes)*60_000
}
export function canBookDelivery(settings:DeliverySettings,date:string,slot:DeliverySlot,now:number) {
  return validDeliveryDate(date) && date>=dateInArgentina(now) && now<deliveryCutoff(settings,date,slot)
}
export function formatCutoff(cutoff:number,date:string) {
  const time=new Intl.DateTimeFormat("es-AR",{timeZone:AR_TIME_ZONE,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(cutoff))
  const cutoffDay=dateInArgentina(cutoff)
  return cutoffDay===date ? time : `${time} del ${cutoffDay.split("-").reverse().join("/")}`
}
export function nextDelivery(settings:DeliverySettings,now:number,fromDate=dateInArgentina(now)) {
  const first=validDeliveryDate(fromDate) && fromDate>dateInArgentina(now) ? fromDate : dateInArgentina(now)
  for (let days=0;days<=8;days++) {
    const date=addDays(first,days)
    for (const slot of DELIVERY_SLOTS) if (canBookDelivery(settings,date,slot,now)) return {date,slot}
  }
  throw new Error("No encontramos una franja disponible con esta configuración.")
}
export function closedDeliveryMessage(settings:DeliverySettings,date:string,slot:DeliverySlot,now:number) {
  const next=nextDelivery(settings,now)
  const day=next.date===dateInArgentina(now) ? "hoy" : next.date.split("-").reverse().join("/")
  return `Ya cerró ${DELIVERY_SLOT_LABEL[slot]} del ${date.split("-").reverse().join("/")} (límite ${formatCutoff(deliveryCutoff(settings,date,slot),date)}). Próximo turno: ${DELIVERY_SLOT_LABEL[next.slot]} ${day}, ${deliveryWindow(settings,next.slot)}.`
}
