"use server"

import { db } from "@/lib/db"
import { orders, orderItems } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import {
  ORDER_STATUS_LABEL,
  canTransition,
  isOrderStatus,
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
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

/** Todos los pedidos (con sus ítems) que se entregan en `date`, en orden de llegada. */
export async function getAdminOrdersForDate(date: string): Promise<AdminOrder[]> {
  await requireAdmin()
  if (!isPanelDate(date)) throw new Error("Fecha inválida")

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.deliveryDate, date))
    .orderBy(asc(orders.createdAt), asc(orders.id))

  const ids = rows.map((o) => o.id)
  const items = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.id))
    : []

  const itemsByOrder = new Map<number, AdminOrderItem[]>()
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) ?? []
    list.push({ id: it.id, name: it.name, price: it.price, packSize: it.packSize, quantity: it.quantity })
    itemsByOrder.set(it.orderId, list)
  }

  return rows.map((o) => ({
    id: o.id,
    customerName: o.customerName,
    isGuest: o.userId === null,
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
