import { redirect } from "next/navigation"
import Link from "next/link"
import { getSessionUser } from "@/lib/session"
import { getMyOrders } from "@/app/actions/orders"
import { SiteHeader } from "@/components/site-header"
import { formatOrderNumber, formatPrice } from "@/lib/format"
import { formatDateAR } from "@/lib/dates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DELIVERY_SLOT_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  statusVariant,
  type DeliverySlot,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/order-status"
import { Package } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function MyOrdersPage() {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  const orders = await getMyOrders()

  return (
    <main className="min-h-dvh bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-6 font-serif text-2xl font-bold">Mis pedidos</h1>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
            <Package className="size-10 opacity-40" />
            <p>Todavía no hiciste pedidos.</p>
            <Button render={<Link href="/" />} nativeButton={false}>Ir al catálogo</Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">Pedido #{formatOrderNumber(o.id)}</p>
                    <p className="text-sm text-muted-foreground">
                      Entrega: {formatDateAR(o.deliveryDate)} ·{" "}
                      {DELIVERY_SLOT_LABEL[o.deliverySlot as DeliverySlot] ?? o.deliverySlot}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(o.status as OrderStatus)}>
                      {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                    </Badge>
                    <Badge variant="outline">
                      {PAYMENT_METHOD_LABEL[o.paymentMethod as PaymentMethod] ?? o.paymentMethod}
                    </Badge>
                  </div>
                </div>
                <ul className="mt-3 divide-y divide-border border-y border-border">
                  {o.items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-2 py-2 text-sm">
                      <span>
                        {it.quantity} × {it.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatPrice(it.price * it.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatPrice(o.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
