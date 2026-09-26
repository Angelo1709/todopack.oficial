import Link from "next/link"
import type { OrderSummary } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { OrderStatusBadge, PaymentMethodLabel } from "@/components/orders/order-meta"
import { AR_TIME_ZONE, formatDateAR } from "@/lib/dates"
import { formatOrderNumber, formatPrice } from "@/lib/format"
import { DELIVERY_SLOT_LABEL } from "@/lib/order-status"
import { CalendarDays, ChevronRight } from "lucide-react"

/** Tarjeta de un pedido en las listas de "Mis pedidos". */
export function OrderCard({ order }: { order: OrderSummary }) {
  const createdAt = new Date(order.createdAt).toLocaleDateString("es-AR", {
    timeZone: AR_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  return (
    <li className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Pedido #{formatOrderNumber(order.id)}</p>
          <p className="text-xs text-muted-foreground">Hecho el {createdAt}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" />
          {formatDateAR(order.deliveryDate)} · {DELIVERY_SLOT_LABEL[order.deliverySlot] ?? order.deliverySlot}
        </span>
        <PaymentMethodLabel method={order.paymentMethod} />
        <span className="tabular-nums">
          {order.itemCount} artículo{order.itemCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-base font-bold tabular-nums">{formatPrice(order.total)}</span>
        <Button
          render={<Link href={`/pedido/${order.publicToken}`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          Ver detalle <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </li>
  )
}
