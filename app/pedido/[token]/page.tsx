import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { orderItems, orders } from "@/lib/db/schema"
import { getSettings } from "@/lib/settings"
import { AR_TIME_ZONE, formatDateAR } from "@/lib/dates"
import { formatOrderNumber, formatPrice } from "@/lib/format"
import { isOrderToken } from "@/lib/guest-orders"
import { orderStatusHint, packLabel } from "@/lib/order-messages"
import {
  DELIVERY_SLOT_LABEL,
  type DeliverySlot,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/order-status"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { OrderProgress } from "@/components/orders/order-progress"
import { OrderStatusBadge, PaymentMethodLabel } from "@/components/orders/order-meta"
import { WhatsappProofButton } from "@/components/orders/whatsapp-proof"
import { ArrowLeft, CalendarDays, MapPin, Phone, StickyNote, User } from "lucide-react"

export const dynamic = "force-dynamic"

// El link del pedido es privado (lo tiene quien compró): que no lo indexen los buscadores.
export const metadata: Metadata = {
  title: "Estado del pedido — TodoPack Alcorta",
  robots: { index: false, follow: false },
}

async function findOrder(token: string) {
  if (!isOrderToken(token)) return null
  const [order] = await db.select().from(orders).where(eq(orders.publicToken, token))
  if (!order) return null
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.id))
  return { order, items }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await findOrder(token)
  if (!data) notFound()

  const { order, items } = data
  const method = order.paymentMethod as PaymentMethod
  const status = order.status as OrderStatus
  const slot = order.deliverySlot as DeliverySlot
  const showProof = method === "transferencia" && status === "pendiente_validacion"
  const settings = showProof ? await getSettings() : null

  const createdDay = order.createdAt.toLocaleDateString("es-AR", {
    timeZone: AR_TIME_ZONE,
    day: "numeric",
    month: "long",
  })
  const createdTime = order.createdAt.toLocaleTimeString("es-AR", {
    timeZone: AR_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

  return (
    <main className="min-h-dvh bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Link
          href="/mis-pedidos"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Mis pedidos
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-serif text-2xl font-bold">Pedido #{formatOrderNumber(order.id)}</h1>
            <p className="text-sm text-muted-foreground">
              Hecho el {createdDay} a las {createdTime}
            </p>
          </div>
          <OrderStatusBadge status={status} className="mt-1" />
        </div>

        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Estado del pedido</h2>
          <OrderProgress method={method} status={status} />
          <p className="mt-4 text-sm text-muted-foreground">{orderStatusHint(method, status)}</p>
          {showProof && settings && (
            <div className="mt-4 flex flex-col gap-2 sm:max-w-sm">
              <WhatsappProofButton whatsappNumber={settings.whatsappNumber} order={order} />
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 font-semibold">Productos</h2>
            <ul className="divide-y divide-border border-y border-border">
              {items.map((it) => {
                const pack = packLabel(it.name, it.packSize)
                return (
                  <li key={it.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-foreground tabular-nums">{it.quantity} ×</span> {it.name}
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {formatPrice(it.price)} c/u
                        {pack ? ` · ${pack}` : null}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatPrice(it.price * it.quantity)}</span>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(order.total)}</span>
            </div>
          </section>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 font-semibold">Entrega y pago</h2>
              <ul className="flex flex-col gap-2.5 text-sm">
                <li className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {capitalize(formatDateAR(order.deliveryDate, { weekday: "long", day: "numeric", month: "long" }))}{" "}
                    · {DELIVERY_SLOT_LABEL[slot] ?? order.deliverySlot}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 break-words">{order.address}</span>
                </li>
                <li className="flex items-start gap-2">
                  <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 break-words">{order.customerName}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="tabular-nums">{order.phone}</span>
                </li>
                {order.notes && (
                  <li className="flex items-start gap-2">
                    <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 whitespace-pre-line break-words text-muted-foreground">
                      {order.notes}
                    </span>
                  </li>
                )}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Medio de pago</span>
                <PaymentMethodLabel method={method} className="font-medium" />
              </div>
            </section>
          </aside>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button render={<Link href="/" />} nativeButton={false} variant="outline" size="lg">
            Seguir comprando
          </Button>
        </div>
      </div>
    </main>
  )
}
