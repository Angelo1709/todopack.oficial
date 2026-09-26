"use server"

import { db } from "@/lib/db"
import { orders, orderItems, products, type Order } from "@/lib/db/schema"
import { getSessionUser, requireUser } from "@/lib/session"
import {
  initialStatus,
  isDeliverySlot,
  isPaymentMethod,
  type DeliverySlot,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/order-status"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { randomBytes } from "node:crypto"
import { isIsoDate, todayAR } from "@/lib/dates"
import { isOrderToken, MAX_REMEMBERED_ORDERS } from "@/lib/guest-orders"

type CheckoutItem = { id: number; quantity: number }

export type CheckoutInput = {
  items: CheckoutItem[]
  customerName: string
  phone: string
  email?: string
  address: string
  deliveryDate: string // yyyy-mm-dd
  deliverySlot: DeliverySlot
  paymentMethod: PaymentMethod
  notes?: string
}

export type CheckoutField =
  | "items"
  | "customerName"
  | "phone"
  | "email"
  | "address"
  | "deliveryDate"
  | "deliverySlot"
  | "paymentMethod"
  | "notes"

/** Lo que necesita la pantalla de éxito del checkout. */
export type CreatedOrder = {
  id: number
  publicToken: string
  total: number
  paymentMethod: PaymentMethod
  deliveryDate: string
  deliverySlot: DeliverySlot
  customerName: string
}

// Los errores esperados se devuelven (no se tiran): en producción Next oculta el mensaje de los throw.
export type CreateOrderResult =
  | { ok: true; order: CreatedOrder }
  | { ok: false; error: string; field?: CheckoutField; unavailableIds?: number[] }

/** Resumen de un pedido para listas (mis pedidos, pedidos de este navegador). */
export type OrderSummary = {
  id: number
  publicToken: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  deliveryDate: string
  deliverySlot: DeliverySlot
  total: number
  itemCount: number
  createdAt: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LINES = 300

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function fail(error: string, field?: CheckoutField): CreateOrderResult {
  return { ok: false, error, field }
}

export async function createOrder(input: CheckoutInput): Promise<CreateOrderResult> {
  // Se puede comprar sin cuenta; si hay sesión el pedido queda asociado al usuario.
  const user = await getSessionUser()

  const customerName = text(input?.customerName)
  const phone = text(input?.phone)
  const email = text(input?.email).toLowerCase()
  const address = text(input?.address)
  const deliveryDate = text(input?.deliveryDate)
  const notes = text(input?.notes)
  const phoneDigits = phone.replace(/\D/g, "")

  if (!Array.isArray(input?.items) || input.items.length === 0) return fail("Tu carrito está vacío", "items")
  if (input.items.length > MAX_LINES) return fail("El pedido tiene demasiados productos", "items")
  if (!customerName) return fail("Completá tu nombre y apellido", "customerName")
  if (customerName.length > 120) return fail("El nombre es demasiado largo", "customerName")
  if (!phone) return fail("Completá tu teléfono", "phone")
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    return fail("Revisá el teléfono: tiene que tener al menos 8 números", "phone")
  }
  if (email && (email.length > 200 || !EMAIL_RE.test(email))) return fail("Revisá el email", "email")
  if (!address) return fail("Completá la dirección de entrega", "address")
  if (address.length > 300) return fail("La dirección es demasiado larga", "address")
  if (notes.length > 1000) return fail("Las notas son demasiado largas", "notes")
  if (!deliveryDate || !isIsoDate(deliveryDate)) return fail("Elegí la fecha de entrega", "deliveryDate")
  // Fechas "yyyy-mm-dd" se comparan como texto; "hoy" es en hora argentina.
  if (deliveryDate < todayAR()) return fail("La fecha de entrega no puede ser en el pasado", "deliveryDate")
  if (!isDeliverySlot(input.deliverySlot)) return fail("Elegí la franja de entrega", "deliverySlot")
  if (!isPaymentMethod(input.paymentMethod)) return fail("Elegí el medio de pago", "paymentMethod")

  // Normalizar cantidades y descartar lo inválido.
  const cleaned = new Map<number, number>()
  for (const it of input.items) {
    const id = Number(it?.id)
    const qty = Math.floor(Number(it?.quantity))
    if (!Number.isInteger(id) || id <= 0) continue
    if (!Number.isInteger(qty) || qty <= 0) continue
    cleaned.set(id, (cleaned.get(id) ?? 0) + qty)
    if (cleaned.get(id)! > 999) return fail("Cantidad demasiado grande por producto (máx. 999)", "items")
  }
  if (cleaned.size === 0) return fail("Tu carrito está vacío", "items")

  const ids = [...cleaned.keys()]
  // Precios recalculados desde la base: nunca confiar en los del cliente.
  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.active, true)))
  const byId = new Map(rows.map((p) => [p.id, p]))

  const unavailableIds = ids.filter((id) => !byId.has(id))
  if (unavailableIds.length) {
    return {
      ok: false,
      error:
        unavailableIds.length === ids.length
          ? "Los productos de tu carrito ya no están disponibles"
          : "Algunos productos ya no están disponibles y los sacamos del carrito. Revisá el pedido y confirmá de nuevo.",
      field: "items",
      unavailableIds,
    }
  }

  let total = 0
  const lineItems = ids.map((id) => {
    const p = byId.get(id)!
    const quantity = cleaned.get(id)!
    total += p.price * quantity
    return { productId: p.id, name: p.name, price: p.price, packSize: p.packSize, quantity }
  })

  const [order] = await db
    .insert(orders)
    .values({
      publicToken: randomBytes(16).toString("base64url"),
      userId: user?.id ?? null,
      customerName,
      phone,
      email: email || null,
      address,
      deliveryDate,
      deliverySlot: input.deliverySlot,
      paymentMethod: input.paymentMethod,
      status: initialStatus(input.paymentMethod),
      total,
      notes: notes || null,
    })
    .returning({ id: orders.id, publicToken: orders.publicToken })

  await db.insert(orderItems).values(lineItems.map((li) => ({ ...li, orderId: order.id })))

  revalidatePath("/mis-pedidos")
  revalidatePath("/admin")

  return {
    ok: true,
    order: {
      id: order.id,
      publicToken: order.publicToken,
      total,
      paymentMethod: input.paymentMethod,
      deliveryDate,
      deliverySlot: input.deliverySlot,
      customerName,
    },
  }
}

async function toSummaries(rows: Order[]): Promise<OrderSummary[]> {
  const ids = rows.map((o) => o.id)
  const counts = ids.length
    ? await db
        .select({ orderId: orderItems.orderId, count: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
        .groupBy(orderItems.orderId)
    : []
  const countById = new Map(counts.map((c) => [c.orderId, c.count]))
  return rows.map((o) => ({
    id: o.id,
    publicToken: o.publicToken,
    status: o.status as OrderStatus,
    paymentMethod: o.paymentMethod as PaymentMethod,
    deliveryDate: o.deliveryDate,
    deliverySlot: o.deliverySlot as DeliverySlot,
    total: o.total,
    itemCount: countById.get(o.id) ?? 0,
    createdAt: o.createdAt.toISOString(),
  }))
}

function cleanTokens(tokens: unknown): string[] {
  if (!Array.isArray(tokens)) return []
  return [...new Set(tokens.filter(isOrderToken))].slice(0, MAX_REMEMBERED_ORDERS)
}

/** Pedidos del usuario logueado. */
export async function getMyOrders(): Promise<OrderSummary[]> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
  return toSummaries(rows)
}

/**
 * Pedidos hechos sin cuenta desde un navegador (tokens guardados en su localStorage).
 * El token es el secreto del pedido: solo se devuelven los pedidos cuyos tokens se reciben.
 */
export async function getOrdersByTokens(tokens: string[]): Promise<OrderSummary[]> {
  const valid = cleanTokens(tokens)
  if (!valid.length) return []
  const rows = await db
    .select()
    .from(orders)
    .where(inArray(orders.publicToken, valid))
    .orderBy(desc(orders.createdAt))
  return toSummaries(rows)
}

/**
 * Asocia a la cuenta logueada los pedidos hechos como invitado desde este navegador.
 * Solo toma pedidos sin dueño. Devuelve cuántos se asociaron y qué tokens ya son del usuario.
 */
export async function claimOrders(tokens: string[]): Promise<{ claimed: number; tokens: string[] }> {
  const user = await requireUser()
  const valid = cleanTokens(tokens)
  if (!valid.length) return { claimed: 0, tokens: [] }

  const claimed = await db
    .update(orders)
    .set({ userId: user.id, updatedAt: new Date() })
    .where(and(inArray(orders.publicToken, valid), isNull(orders.userId)))
    .returning({ id: orders.id })

  const owned = await db
    .select({ publicToken: orders.publicToken })
    .from(orders)
    .where(and(inArray(orders.publicToken, valid), eq(orders.userId, user.id)))

  if (claimed.length) {
    revalidatePath("/mis-pedidos")
    revalidatePath("/admin")
  }
  return { claimed: claimed.length, tokens: owned.map((o) => o.publicToken) }
}
