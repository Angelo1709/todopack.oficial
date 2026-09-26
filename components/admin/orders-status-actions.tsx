"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateOrderStatus } from "@/app/actions/admin-orders"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { orderLabel } from "@/lib/admin-orders-utils"
import { formatPrice } from "@/lib/format"
import {
  ORDER_STATUS_LABEL,
  nextStatuses,
  transitionLabel,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/order-status"
import { cn } from "@/lib/utils"

type OrderRef = {
  id: number
  customerName: string
  total: number
  paymentMethod: PaymentMethod
  status: OrderStatus
}

/** Cambia el estado de un pedido con toast de resultado. La página se actualiza sola (revalidatePath). */
export function useOrderStatusUpdate() {
  const [pending, startTransition] = useTransition()

  function run(orderId: number, to: OrderStatus, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const result = await updateOrderStatus(orderId, to)
        if (result.ok) {
          toast.success(`Pedido ${orderLabel(orderId)}: ${ORDER_STATUS_LABEL[result.status]}`)
          onSuccess?.()
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("No pudimos actualizar el pedido. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return { pending, run }
}

// Botones cómodos para el dedo en el celular; compactos desde sm.
const actionButton = "h-10 flex-1 px-3 sm:h-8 sm:flex-none"

/** Botones con los pasos posibles del pedido (`nextStatuses`). Cancelar pide confirmación. */
export function OrdersStatusActions({ order, className }: { order: OrderRef; className?: string }) {
  const { pending, run } = useOrderStatusUpdate()
  const [target, setTarget] = useState<OrderStatus | null>(null)
  const next = nextStatuses(order.paymentMethod, order.status)
  if (next.length === 0) return null

  function go(to: OrderStatus) {
    setTarget(to)
    run(order.id, to)
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {next
        .filter((to) => to !== "cancelado")
        .map((to) => (
          <Button key={to} className={actionButton} disabled={pending} onClick={() => go(to)}>
            {pending && target === to && <Spinner aria-label="Actualizando" />}
            {transitionLabel(order.paymentMethod, to)}
          </Button>
        ))}
      {next.includes("cancelado") && <CancelOrderButton order={order} disabled={pending} />}
    </div>
  )
}

function CancelOrderButton({ order, disabled }: { order: OrderRef; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useOrderStatusUpdate()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className={cn(actionButton, "text-destructive hover:text-destructive")} />}
        disabled={disabled}
      >
        {transitionLabel(order.paymentMethod, "cancelado")}
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>¿Cancelar el pedido {orderLabel(order.id)}?</DialogTitle>
          <DialogDescription>
            El pedido de <span className="font-medium text-foreground">{order.customerName}</span> por{" "}
            <span className="font-medium text-foreground tabular-nums">{formatPrice(order.total)}</span> va a quedar
            cancelado. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-10 sm:h-8" />} disabled={pending}>
            Volver
          </DialogClose>
          <Button
            variant="destructive"
            className="h-10 sm:h-8"
            disabled={pending}
            onClick={() => run(order.id, "cancelado", () => setOpen(false))}
          >
            {pending && <Spinner aria-label="Cancelando" />}
            {pending ? "Cancelando..." : "Sí, cancelar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
