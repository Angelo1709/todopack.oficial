import { OrdersCard } from "@/components/admin/orders-card"
import type { AdminOrder, StatusFilter } from "@/lib/admin-orders-utils"
import { formatPrice } from "@/lib/format"
import { DELIVERY_SLOT_LABEL, type DeliverySlot } from "@/lib/order-status"
import { Moon, Sun } from "lucide-react"

const SLOT_ICON = { mediodia: Sun, noche: Moon } as const

/** Pedidos agrupados por franja, cada sección con cantidad y total. Los cancelados van al final. */
export function OrdersList({
  orders,
  slots,
  estado,
}: {
  orders: AdminOrder[]
  slots: DeliverySlot[]
  estado: StatusFilter
}) {
  return (
    <div className="flex flex-col gap-8">
      {slots.map((slot) => {
        const slotOrders = orders.filter((o) => o.deliverySlot === slot)
        const active = slotOrders.filter((o) => o.status !== "cancelado")
        const cancelled = slotOrders.filter((o) => o.status === "cancelado")
        const counted = estado === "cancelados" ? cancelled : active
        const total = counted.reduce((sum, o) => sum + o.total, 0)
        const Icon = SLOT_ICON[slot]

        return (
          <section key={slot} aria-labelledby={`franja-${slot}`}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <h2 id={`franja-${slot}`} className="flex items-center gap-2 font-serif text-lg font-bold">
                <Icon className="size-4 text-primary" />
                {DELIVERY_SLOT_LABEL[slot]}
              </h2>
              <p className="text-sm text-muted-foreground">
                <span className="tabular-nums">
                  {counted.length} {counted.length === 1 ? "pedido" : "pedidos"}
                </span>
                {estado === "todos" && cancelled.length > 0 && (
                  <span className="tabular-nums">
                    {" "}
                    (+{cancelled.length} {cancelled.length === 1 ? "cancelado" : "cancelados"})
                  </span>
                )}{" "}
                · <span className="font-semibold text-foreground tabular-nums">{formatPrice(total)}</span>
              </p>
            </div>

            {slotOrders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Sin pedidos para {slot === "mediodia" ? "el mediodía" : "la noche"}.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {active.map((o, idx) => (
                  <OrdersCard key={o.id} order={o} position={idx + 1} />
                ))}
                {cancelled.map((o) => (
                  <OrdersCard key={o.id} order={o} position={0} />
                ))}
              </ol>
            )}
          </section>
        )
      })}
    </div>
  )
}
