"use server"

import { db } from "@/lib/db"
import { orders, orderItems, products } from "@/lib/db/schema"
import { getSessionUser, requireUser } from "@/lib/session"
import { initialStatus, isDeliverySlot, isPaymentMethod, type DeliverySlot, type PaymentMethod } from "@/lib/order-status"
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { randomBytes } from "node:crypto"
import { isIsoDate, todayAR } from "@/lib/dates"

type CheckoutItem = { id: number; quantity: number }

export type CheckoutInput = {
  items: CheckoutItem[]
  customerName: string
  phone: string
  address: string
  deliveryDate: string // yyyy-mm-dd
  deliverySlot: DeliverySlot
  paymentMethod: PaymentMethod
  notes?: string
}

export async function createOrder(input: CheckoutInput) {
  // Se puede comprar sin cuenta; si hay sesión el pedido queda asociado al usuario.
  const user = await getSessionUser()

  if (!input.items?.length) throw new Error("El carrito está vacío")
  if (!input.customerName?.trim()) throw new Error("Falta el nombre")
  if (!input.phone?.trim()) throw new Error("Falta el teléfono")
  if (!input.address?.trim()) throw new Error("Falta la dirección")
  if (!input.deliveryDate) throw new Error("Falta la fecha de entrega")
  if (!isDeliverySlot(input.deliverySlot)) throw new Error("Elegí la franja de entrega")
  if (!isPaymentMethod(input.paymentMethod)) throw new Error("Medio de pago inválido")

  // Fechas "yyyy-mm-dd" se comparan como texto; "hoy" es en hora argentina.
  if (!isIsoDate(input.deliveryDate) || input.deliveryDate < todayAR()) {
    throw new Error("La fecha de entrega no puede ser en el pasado")
  }

  // Normalize + cap quantities, drop invalid
  const cleaned = new Map<number, number>()
  for (const it of input.items) {
    const id = Number(it.id)
    const qty = Math.floor(Number(it.quantity))
    if (!Number.isInteger(id) || id <= 0) continue
    if (!Number.isInteger(qty) || qty <= 0) continue
    if (qty > 999) throw new Error("Cantidad demasiado grande por producto (máx. 999)")
    cleaned.set(id, (cleaned.get(id) ?? 0) + qty)
  }
  if (cleaned.size === 0) throw new Error("El carrito está vacío")

  const ids = [...cleaned.keys()]
  // Recompute prices server-side from the DB — never trust client prices.
  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.active, true)))

  if (rows.length === 0) throw new Error("Los productos ya no están disponibles")

  let total = 0
  const lineItems = rows.map((p) => {
    const quantity = cleaned.get(p.id)!
    total += p.price * quantity
    return { productId: p.id, name: p.name, price: p.price, packSize: p.packSize, quantity }
  })

  const [order] = await db
    .insert(orders)
    .values({
      publicToken: randomBytes(16).toString("base64url"),
      userId: user?.id ?? null,
      customerName: input.customerName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      deliveryDate: input.deliveryDate,
      deliverySlot: input.deliverySlot,
      paymentMethod: input.paymentMethod,
      status: initialStatus(input.paymentMethod),
      total,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: orders.id, publicToken: orders.publicToken })

  await db.insert(orderItems).values(lineItems.map((li) => ({ ...li, orderId: order.id })))

  revalidatePath("/mis-pedidos")
  revalidatePath("/admin")

  return { orderId: order.id, publicToken: order.publicToken, total }
}

export async function getMyOrders() {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))

  const ids = rows.map((o) => o.id)
  const items = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : []
  return rows.map((o) => ({ ...o, items: items.filter((it) => it.orderId === o.id) }))
}
