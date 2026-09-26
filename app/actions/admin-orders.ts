"use server"

import { db } from "@/lib/db"
import { orders, orderItems } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import { canTransition, isOrderStatus, type OrderStatus, type PaymentMethod } from "@/lib/order-status"
import { desc, eq, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export async function getOrdersByDate(dateStr: string) {
  await requireAdmin()
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.deliveryDate, dateStr))
    .orderBy(desc(orders.createdAt))

  const ids = rows.map((o) => o.id)
  const items = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : []
  return rows.map((o) => ({ ...o, items: items.filter((it) => it.orderId === o.id) }))
}

export async function getDeliverySummary(dateStr: string) {
  await requireAdmin()
  const [row] = await db
    .select({
      totalOrders: sql<number>`count(*) filter (where ${orders.status} <> 'cancelado')::int`,
      totalRevenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} <> 'cancelado'), 0)::int`,
      cashPending: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'pendiente_entrega'), 0)::int`,
      transferPending: sql<number>`count(*) filter (where ${orders.status} = 'pendiente_validacion')::int`,
    })
    .from(orders)
    .where(eq(orders.deliveryDate, dateStr))
  return row
}

export async function updateOrderStatus(orderId: number, to: OrderStatus) {
  await requireAdmin()
  if (!isOrderStatus(to)) throw new Error("Estado inválido")

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
  if (!order) throw new Error("El pedido no existe")
  if (!canTransition(order.paymentMethod as PaymentMethod, order.status as OrderStatus, to)) {
    throw new Error("No se puede pasar el pedido a ese estado")
  }

  const now = new Date()
  await db
    .update(orders)
    .set({
      status: to,
      updatedAt: now,
      ...(to === "pagado" ? { paidAt: now } : {}),
      // En efectivo "pagado" significa entregado y cobrado.
      ...(to === "entregado" || (to === "pagado" && order.paymentMethod === "efectivo")
        ? { deliveredAt: now }
        : {}),
    })
    .where(eq(orders.id, orderId))
  revalidatePath("/admin")
}
