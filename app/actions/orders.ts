"use server"

import { db } from "@/lib/db"
import { orders, orderItems, products } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

type CheckoutItem = { id: number; quantity: number }

export type CheckoutInput = {
  items: CheckoutItem[]
  customerName: string
  phone: string
  address: string
  deliveryDate: string // yyyy-mm-dd
  paymentMethod: "efectivo" | "transferencia"
  paymentProofUrl?: string
  notes?: string
}

export async function createOrder(input: CheckoutInput) {
  const user = await requireUser()

  if (!input.items?.length) throw new Error("El carrito está vacío")
  if (!input.customerName?.trim()) throw new Error("Falta el nombre")
  if (!input.phone?.trim()) throw new Error("Falta el teléfono")
  if (!input.address?.trim()) throw new Error("Falta la dirección")
  if (!input.deliveryDate) throw new Error("Falta la fecha de entrega")
  if (!["efectivo", "transferencia"].includes(input.paymentMethod)) {
    throw new Error("Medio de pago inválido")
  }

  // Validate delivery date is today or future
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const chosen = new Date(input.deliveryDate + "T00:00:00")
  if (Number.isNaN(chosen.getTime()) || chosen < today) {
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
    return { productId: p.id, name: p.name, price: p.price, quantity }
  })

  const [order] = await db
    .insert(orders)
    .values({
      userId: user.id,
      customerName: input.customerName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      deliveryDate: input.deliveryDate,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentMethod === "efectivo" ? "pendiente" : "pendiente",
      paymentProofUrl: input.paymentProofUrl?.trim() || null,
      status: "nuevo",
      total,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: orders.id })

  await db.insert(orderItems).values(lineItems.map((li) => ({ ...li, orderId: order.id })))

  revalidatePath("/mis-pedidos")
  revalidatePath("/admin")

  return { orderId: order.id, total }
}

export async function getMyOrders() {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))

  const withItems = await Promise.all(
    rows.map(async (o) => {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id))
      return { ...o, items }
    }),
  )
  return withItems
}
