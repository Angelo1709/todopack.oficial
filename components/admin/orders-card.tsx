import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OrdersStatusActions } from "@/components/admin/orders-status-actions"
import {
  customerWhatsAppUrl,
  mapsUrl,
  orderLabel,
  packUnitsLabel,
  type AdminOrder,
} from "@/lib/admin-orders-utils"
import { formatPrice } from "@/lib/format"
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, statusVariant } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { Banknote, Landmark, MapPin, MessageCircle, Phone, StickyNote, X } from "lucide-react"

/** Fila de pedido del panel: datos de entrega, ítems y acciones. */
export function OrdersCard({ order, position }: { order: AdminOrder; position: number }) {
  const cancelled = order.status === "cancelado"
  const PaymentIcon = order.paymentMethod === "efectivo" ? Banknote : Landmark

  return (
    <li
      id={`pedido-${order.id}`}
      className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", cancelled && "opacity-70")}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums",
            cancelled ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
          )}
          title={cancelled ? "Cancelado" : `Entrega ${position} de la franja`}
        >
          {cancelled ? <X className="size-4" /> : position}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-semibold leading-tight">{order.customerName}</p>
            {order.isGuest && <Badge variant="outline">Invitado</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{orderLabel(order.id)}</span> ·{" "}
            {order.createdLabel}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-bold leading-tight tabular-nums">{formatPrice(order.total)}</p>
          <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <PaymentIcon className="size-3.5" />
            {PAYMENT_METHOD_LABEL[order.paymentMethod]}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Badge variant={statusVariant(order.status)}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <a
            href={mapsUrl(order.address)}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span className="break-words">{order.address}</span>
          </a>
          <a
            href={`tel:${order.phone.replace(/[^\d+]/g, "")}`}
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Phone className="size-3.5 shrink-0" />
            <span className="tabular-nums">{order.phone}</span>
          </a>
        </div>
        <Button
          variant="outline"
          className="h-9 shrink-0 px-3 sm:h-8"
          render={<a href={customerWhatsAppUrl(order)} target="_blank" rel="noreferrer" />}
          nativeButton={false}
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </Button>
      </div>

      <ul className="mt-3 flex flex-col gap-1 border-y border-border py-2 text-sm">
        {order.items.map((it) => {
          const units = packUnitsLabel(it)
          return (
            <li key={it.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{it.quantity} ×</span> {it.name}
                {units && <span className="whitespace-nowrap tabular-nums"> {units}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatPrice(it.price * it.quantity)}
              </span>
            </li>
          )
        })}
        {order.items.length === 0 && <li className="text-muted-foreground">Sin productos cargados.</li>}
      </ul>

      {order.notes && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm">
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-words">
            <span className="font-medium">Nota:</span> {order.notes}
          </span>
        </p>
      )}

      <OrdersStatusActions
        order={{
          id: order.id,
          customerName: order.customerName,
          total: order.total,
          paymentMethod: order.paymentMethod,
          status: order.status,
        }}
        className="mt-3 sm:justify-end"
      />
    </li>
  )
}
