// Helpers puros del panel de pedidos (filtros de la URL, resumen del día y carga).
// Sin acceso a la base: se usan tanto en server components como en el cliente.

import { AR_TIME_ZONE, formatDateAR, isIsoDate } from "@/lib/dates"
import { formatOrderNumber } from "@/lib/format"
import {
  isDeliverySlot,
  isFinalStatus,
  type DeliverySlot,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/order-status"
import type { LatLng, LocationStatus } from "@/lib/route"
import { whatsappUrl } from "@/lib/whatsapp"

// ---- Tipos que viajan al cliente (sólo lo que muestra el panel) ----

export type AdminOrderItem = {
  id: number
  name: string
  price: number
  packSize: number
  quantity: number
}

export type AdminOrder = {
  id: number
  customerName: string
  isGuest: boolean
  phone: string
  address: string
  deliveryDate: string
  deliverySlot: DeliverySlot
  paymentMethod: PaymentMethod
  status: OrderStatus
  total: number
  notes: string | null
  /** Ubicación de la entrega para el recorrido (null si no se buscó o no se encontró). */
  location: LatLng | null
  /** null = todavía no se buscó en el mapa. */
  locationStatus: LocationStatus | null
  /** "Recibido a las 18:30" o "Recibido el vie, 25 sept a las 18:30" (hora argentina). */
  createdLabel: string
  items: AdminOrderItem[]
}

export type PendingTransfer = {
  id: number
  customerName: string
  phone: string
  deliveryDate: string
  deliverySlot: DeliverySlot
  total: number
}

export type OrderStatusResult = { ok: true; status: OrderStatus } | { ok: false; error: string }

// ---- Filtros (estado en la URL: ?date=yyyy-mm-dd&slot=...&estado=...&vista=...) ----

export const STATUS_FILTERS = ["todos", "por_validar", "por_entregar", "finalizados", "cancelados"] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  todos: "Todos",
  por_validar: "Por validar",
  por_entregar: "Por entregar",
  finalizados: "Finalizados",
  cancelados: "Cancelados",
}

export type SlotFilter = DeliverySlot | "todas"
export const ADMIN_VIEWS = ["pedidos", "carga", "recorrido"] as const
export type AdminView = (typeof ADMIN_VIEWS)[number]

export type AdminFilters = {
  date: string
  slot: SlotFilter
  estado: StatusFilter
  vista: AdminView
}

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

/** Fecha razonable para el panel (descarta años raros que aparecen mientras se tipea en el input). */
export function isPanelDate(value: string | undefined): value is string {
  if (!value || !isIsoDate(value)) return false
  const year = Number(value.slice(0, 4))
  return year >= 2020 && year <= 2100
}

export function parseAdminFilters(params: SearchParams, today: string): AdminFilters {
  const date = first(params.date)
  const slot = first(params.slot)
  const estado = first(params.estado)
  const vista = first(params.vista)
  return {
    date: isPanelDate(date) ? date : today,
    slot: isDeliverySlot(slot) ? slot : "todas",
    estado: STATUS_FILTERS.includes(estado as StatusFilter) ? (estado as StatusFilter) : "todos",
    vista: ADMIN_VIEWS.includes(vista as AdminView) ? (vista as AdminView) : "pedidos",
  }
}

/**
 * Link al panel con los filtros actuales más `changes`. Sin `date` en `changes` se mantiene la fecha
 * elegida; con `date: null` se omite para que el servidor use el día de hoy (botón "Hoy").
 */
export function adminOrdersHref(
  filters: AdminFilters,
  changes: Partial<Omit<AdminFilters, "date">> & { date?: string | null } = {},
) {
  const next = { ...filters, ...changes }
  const params = new URLSearchParams()
  if (next.date) params.set("date", next.date)
  if (next.slot !== "todas") params.set("slot", next.slot)
  if (next.estado !== "todos") params.set("estado", next.estado)
  if (next.vista !== "pedidos") params.set("vista", next.vista)
  const query = params.toString()
  return query ? `/admin?${query}` : "/admin"
}

export function matchesStatusFilter(filter: StatusFilter, method: PaymentMethod, status: OrderStatus) {
  switch (filter) {
    case "por_validar":
      return status === "pendiente_validacion"
    case "por_entregar":
      // Listos para salir: efectivo sin entregar o transferencia ya validada.
      return !isFinalStatus(method, status) && status !== "pendiente_validacion"
    case "finalizados":
      return status !== "cancelado" && isFinalStatus(method, status)
    case "cancelados":
      return status === "cancelado"
    default:
      return true
  }
}

// ---- Resumen del día ----

export type DaySummary = {
  orders: number
  revenue: number
  cashPending: number
  cashPendingOrders: number
  transfersPending: number
}

export function summarizeOrders(orders: AdminOrder[]): DaySummary {
  const summary: DaySummary = { orders: 0, revenue: 0, cashPending: 0, cashPendingOrders: 0, transfersPending: 0 }
  for (const o of orders) {
    if (o.status === "cancelado") continue
    summary.orders++
    summary.revenue += o.total
    if (o.status === "pendiente_entrega") {
      summary.cashPending += o.total
      summary.cashPendingOrders++
    }
    if (o.status === "pendiente_validacion") summary.transfersPending++
  }
  return summary
}

/** Pedidos no cancelados por franja. */
export function countBySlot(orders: AdminOrder[]): Record<DeliverySlot, number> {
  const counts: Record<DeliverySlot, number> = { mediodia: 0, noche: 0 }
  for (const o of orders) if (o.status !== "cancelado") counts[o.deliverySlot]++
  return counts
}

// ---- Carga del día ----

export type LoadLine = {
  key: string
  name: string
  packSize: number
  /** Presentaciones pedidas (packs, cajas o unidades sueltas). */
  quantity: number
  /** Unidades sueltas totales (quantity × packSize). */
  units: number
}

/** Productos consolidados de los pedidos no cancelados, ordenados por nombre. */
export function consolidateLoad(orders: AdminOrder[]): LoadLine[] {
  const lines = new Map<string, LoadLine>()
  for (const o of orders) {
    if (o.status === "cancelado") continue
    for (const it of o.items) {
      const packSize = Math.max(1, it.packSize)
      const key = `${it.name}|${packSize}`
      const line = lines.get(key) ?? { key, name: it.name, packSize, quantity: 0, units: 0 }
      line.quantity += it.quantity
      line.units += it.quantity * packSize
      lines.set(key, line)
    }
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name, "es"))
}

// ---- Formatos ----

export function orderLabel(id: number) {
  return `#${formatOrderNumber(id)}`
}

/** "(12 u.)" para 2 packs de 6; null si se vende por unidad. */
export function packUnitsLabel(item: Pick<AdminOrderItem, "packSize" | "quantity">) {
  return item.packSize > 1 ? `(${item.quantity * item.packSize} u.)` : null
}

/** "2 × COCA COLA 1.5L PACK X6 (12 u.)" */
export function itemLabel(item: Pick<AdminOrderItem, "name" | "packSize" | "quantity">) {
  const units = packUnitsLabel(item)
  return `${item.quantity} × ${item.name}${units ? ` ${units}` : ""}`
}

/** Día (yyyy-mm-dd) de un instante, en hora argentina. */
export function dateInAR(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: AR_TIME_ZONE }).format(date)
}

/** "18:30" en hora argentina. */
export function timeInAR(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
}

export function createdLabel(createdAt: Date, deliveryDate: string) {
  const day = dateInAR(createdAt)
  const time = timeInAR(createdAt)
  return day === deliveryDate ? `Recibido a las ${time}` : `Recibido el ${formatDateAR(day)} a las ${time}`
}

/** "sábado, 26 de septiembre" */
export function longDateAR(date: string) {
  return formatDateAR(date, { weekday: "long", day: "numeric", month: "long" })
}

/** "Hoy" / "Mañana" / "Ayer" o null. */
export function relativeDayLabel(date: string, today: string) {
  if (date === today) return "Hoy"
  const diff = Math.round(
    (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000,
  )
  if (diff === 1) return "Mañana"
  if (diff === -1) return "Ayer"
  return null
}

export function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** WhatsApp al cliente con el saludo y el número de pedido. */
export function customerWhatsAppUrl(order: { id: number; customerName: string; phone: string }) {
  const firstName = order.customerName.trim().split(/\s+/)[0] || order.customerName
  return whatsappUrl(
    order.phone,
    `¡Hola ${firstName}! Te escribimos de TodoPack Alcorta por tu pedido ${orderLabel(order.id)}.`,
  )
}
