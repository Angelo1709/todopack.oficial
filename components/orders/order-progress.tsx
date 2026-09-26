import { ORDER_STATUS_LABEL, statusFlow, type OrderStatus, type PaymentMethod } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { Check, XCircle } from "lucide-react"

/** Etapas del pedido según el medio de pago; si está cancelado lo dice en lugar del progreso. */
export function OrderProgress({ method, status }: { method: PaymentMethod; status: OrderStatus }) {
  if (status === "cancelado") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <XCircle className="size-5 shrink-0" />
        <p className="font-medium">{ORDER_STATUS_LABEL.cancelado}: este pedido no se va a entregar.</p>
      </div>
    )
  }

  const flow = statusFlow(method)
  const current = Math.max(flow.indexOf(status), 0)
  const isLast = current === flow.length - 1

  return (
    <ol className="flex items-start">
      {flow.map((step, i) => {
        const done = i < current || (i === current && isLast)
        const active = i === current && !isLast
        const reached = i <= current
        return (
          <li
            key={step}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-2 px-1 text-center",
              i > 0 &&
                "before:absolute before:right-1/2 before:top-3.5 before:h-0.5 before:w-full before:-translate-y-1/2",
              i > 0 && (reached ? "before:bg-primary" : "before:bg-border"),
            )}
          >
            <span
              className={cn(
                "relative z-10 grid size-7 place-items-center rounded-full text-xs font-bold tabular-nums",
                done && "bg-primary text-primary-foreground",
                active && "border-2 border-primary bg-card text-foreground ring-4 ring-primary/15",
                !reached && "border border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs leading-tight",
                i === current ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {ORDER_STATUS_LABEL[step]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
