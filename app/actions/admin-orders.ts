"use server"

import { db } from "@/lib/db"
import { orders, orderItems, user } from "@/lib/db/schema"
import { requireAdmin, type SessionUser } from "@/lib/session"
import {
  ORDER_STATUS_LABEL,
  canTransition,
  initialStatus,
  isDeliverySlot,
  isOrderOrigin,
  isOrderStatus,
  isPaymentMethod,
  type DeliverySlot,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/order-status"
import {
  createdLabel,
  isPanelDate,
  orderLabel,
  type AdminOrder,
  type AdminOrderItem,
  type OrderStatusResult,
  type PendingTransfer,
} from "@/lib/admin-orders-utils"
import { isLocationStatus } from "@/lib/route"
import { isIsoDate, todayAR } from "@/lib/dates"
import { locateOrder } from "@/lib/order-location"
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { randomBytes } from "node:crypto"

/** Todos los pedidos (con sus ítems) que se entregan en `date`, en orden de llegada. */
export async function getAdminOrdersForDate(date: string): Promise<AdminOrder[]> {
  await requireAdmin()
  if (!isPanelDate(date)) throw new Error("Fecha inválida")

  const rows = await db
    .select({ order: orders, createdByName: user.name })
    .from(orders)
    .leftJoin(user, eq(user.id, orders.createdBy))
    .where(eq(orders.deliveryDate, date))
    .orderBy(asc(orders.createdAt), asc(orders.id))

  const ids = rows.map((r) => r.order.id)
  const items = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.id))
    : []

  const itemsByOrder = new Map<number, AdminOrderItem[]>()
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) ?? []
    list.push({ id: it.id, name: it.name, price: it.price, packSize: it.packSize, quantity: it.quantity })
    itemsByOrder.set(it.orderId, list)
  }

  return rows.map(({ order: o, createdByName }) => ({
    id: o.id,
    customerName: o.customerName,
    isGuest: o.userId === null && o.origin !== "manual",
    origin: isOrderOrigin(o.origin) ? o.origin : "web",
    createdByName,
    phone: o.phone,
    address: o.address,
    deliveryDate: o.deliveryDate,
    deliverySlot: o.deliverySlot as DeliverySlot,
    paymentMethod: o.paymentMethod as PaymentMethod,
    status: o.status as OrderStatus,
    total: o.total,
    notes: o.notes,
    location: o.lat !== null && o.lng !== null ? { lat: o.lat, lng: o.lng } : null,
    locationStatus: isLocationStatus(o.locationStatus) ? o.locationStatus : null,
    createdLabel: createdLabel(o.createdAt, o.deliveryDate),
    items: itemsByOrder.get(o.id) ?? [],
  }))
}

/** Transferencias sin validar de cualquier fecha, de la entrega más próxima (o atrasada) a la más lejana. */
export async function getPendingTransfers(): Promise<PendingTransfer[]> {
  await requireAdmin()
  const rows = await db
    .select({
      id: orders.id,
      customerName: orders.customerName,
      phone: orders.phone,
      deliveryDate: orders.deliveryDate,
      deliverySlot: orders.deliverySlot,
      total: orders.total,
    })
    .from(orders)
    .where(eq(orders.status, "pendiente_validacion"))
    .orderBy(asc(orders.deliveryDate), asc(orders.deliverySlot), asc(orders.createdAt))
    .limit(100)
  return rows.map((r) => ({ ...r, deliverySlot: r.deliverySlot as DeliverySlot }))
}

export async function countPendingTransfers(): Promise<number> {
  await requireAdmin()
  const [row] = await db.select({ n: count() }).from(orders).where(eq(orders.status, "pendiente_validacion"))
  return row?.n ?? 0
}

export async function updateOrderStatus(orderId: number, to: OrderStatus): Promise<OrderStatusResult> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, error: "Tu sesión no tiene permisos de administrador. Volvé a ingresar." }
  }
  if (!Number.isInteger(orderId) || !isOrderStatus(to)) return { ok: false, error: "Datos inválidos" }

  const [order] = await db
    .select({ status: orders.status, paymentMethod: orders.paymentMethod })
    .from(orders)
    .where(eq(orders.id, orderId))
  if (!order) return { ok: false, error: "El pedido no existe" }

  const from = order.status as OrderStatus
  const method = order.paymentMethod as PaymentMethod
  if (!canTransition(method, from, to)) {
    return {
      ok: false,
      error: `El pedido ${orderLabel(orderId)} está "${ORDER_STATUS_LABEL[from] ?? from}" y no puede pasar a "${ORDER_STATUS_LABEL[to]}".`,
    }
  }

  const now = new Date()
  // Sólo actualiza si nadie lo cambió desde que lo leímos (dos pestañas, doble toque...).
  const updated = await db
    .update(orders)
    .set({
      status: to,
      updatedAt: now,
      ...(to === "pagado" ? { paidAt: now } : {}),
      // En efectivo "pagado" significa entregado y cobrado.
      ...(to === "entregado" || (to === "pagado" && method === "efectivo") ? { deliveredAt: now } : {}),
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, from)))
    .returning({ id: orders.id })
  if (updated.length === 0) {
    return { ok: false, error: "El pedido cambió mientras tanto. Actualizá la página y revisalo." }
  }

  // Panel (incluye el contador de la pestaña Pedidos) y las vistas del cliente.
  revalidatePath("/admin", "layout")
  revalidatePath("/mis-pedidos")
  revalidatePath("/pedido/[token]", "page")
  return { ok: true, status: to }
}

// ---- Pedidos cargados a mano desde el panel ----

export type ManualOrderInput = {
  customerName: string
  address: string
  phone?: string
  deliveryDate: string // yyyy-mm-dd
  deliverySlot: DeliverySlot
  paymentMethod: PaymentMethod
  /** Importe a cobrar en pesos ("15.000", "$ 15000"...). Vacío = sin importe. */
  total?: string | number
  notes?: string
}

export type ManualOrderField = keyof ManualOrderInput

export type ManualOrderResult =
  | { ok: true; id: number; deliveryDate: string; located: boolean }
  | { ok: false; error: string; field?: ManualOrderField }

const MAX_TOTAL = 100_000_000

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** "15.000", "$ 15000" o "15000,50" -> 15000. Vacío -> 0. null si no es un importe. */
function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null
  const raw = text(value)
  if (!raw) return 0
  const clean = raw.replace(/[$\s.]/g, "").replace(/,\d{0,2}$/, "")
  return /^\d+$/.test(clean) ? Number(clean) : null
}

/**
 * Pedido tomado por teléfono o en el local: entra a la lista del día junto con los de la web y al
 * recorrido. No tiene productos cargados; `total` es lo que hay que cobrar (0 si no se sabe).
 */
export async function createManualOrder(input: ManualOrderInput): Promise<ManualOrderResult> {
  let admin: SessionUser
  try {
    admin = await requireAdmin()
  } catch {
    return { ok: false, error: "Tu sesión no tiene permisos de administrador. Volvé a ingresar." }
  }
  const fail = (error: string, field?: ManualOrderField): ManualOrderResult => ({ ok: false, error, field })

  const customerName = text(input?.customerName).replace(/\s+/g, " ")
  const address = text(input?.address).replace(/\s+/g, " ")
  const phone = text(input?.phone)
  const phoneDigits = phone.replace(/\D/g, "")
  const deliveryDate = text(input?.deliveryDate)
  const notes = text(input?.notes)
  const total = parseAmount(input?.total)

  if (!customerName) return fail("Completá el nombre del cliente", "customerName")
  if (customerName.length > 120) return fail("El nombre es demasiado largo", "customerName")
  if (!address) return fail("Completá la dirección de entrega", "address")
  if (address.length > 300) return fail("La dirección es demasiado larga", "address")
  if (phone && (phoneDigits.length < 8 || phoneDigits.length > 15)) {
    return fail("Revisá el teléfono: tiene que tener al menos 8 números", "phone")
  }
  if (!deliveryDate || !isIsoDate(deliveryDate)) return fail("Elegí la fecha de entrega", "deliveryDate")
  if (deliveryDate < todayAR()) return fail("La fecha de entrega no puede ser en el pasado", "deliveryDate")
  if (!isDeliverySlot(input?.deliverySlot)) return fail("Elegí la franja de entrega", "deliverySlot")
  if (!isPaymentMethod(input?.paymentMethod)) return fail("Elegí el medio de pago", "paymentMethod")
  if (total === null || total > MAX_TOTAL) return fail("Revisá el importe: solo números, por ejemplo 15000", "total")
  if (notes.length > 1000) return fail("Las notas son demasiado largas", "notes")

  const [order] = await db
    .insert(orders)
    .values({
      publicToken: randomBytes(16).toString("base64url"),
      userId: null,
      customerName,
      phone,
      email: null,
      address,
      deliveryDate,
      deliverySlot: input.deliverySlot,
      paymentMethod: input.paymentMethod,
      status: initialStatus(input.paymentMethod),
      total,
      notes: notes || null,
      origin: "manual",
      createdBy: admin.id,
    })
    .returning({ id: orders.id })

  // Se ubica ahora (no en segundo plano) para que ya aparezca en el recorrido al volver a la lista.
  let located = false
  try {
    const outcome = await locateOrder(order.id)
    located = outcome === "exacta" || outcome === "aproximada" || outcome === "manual"
  } catch (err) {
    console.error(`[pedido ${order.id}] no se pudo ubicar la dirección`, err)
  }

  // Panel (incluye el contador de transferencias por validar de la pestaña Pedidos).
  revalidatePath("/admin", "layout")
  return { ok: true, id: order.id, deliveryDate, located }
}
