import { Badge } from "@/components/ui/badge"
import {
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  statusVariant,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { Banknote, Landmark } from "lucide-react"

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge variant={statusVariant(status)} className={className}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

export function PaymentMethodLabel({ method, className }: { method: PaymentMethod; className?: string }) {
  const Icon = method === "transferencia" ? Landmark : Banknote
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon className="size-3.5 shrink-0" />
      {PAYMENT_METHOD_LABEL[method] ?? method}
    </span>
  )
}
