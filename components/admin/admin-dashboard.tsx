"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { formatOrderNumber, formatPrice } from "@/lib/format"
import { updateOrderStatus } from "@/app/actions/admin-orders"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DELIVERY_SLOT_LABEL,
  ORDER_STATUS_LABEL,
  nextStatuses,
  statusVariant,
  transitionLabel,
  type DeliverySlot,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/order-status"
import { Banknote, Landmark, MapPin, Phone, Package, DollarSign, ClipboardCheck, Clock } from "lucide-react"
import { toast } from "sonner"

type OrderItem = { id: number; name: string; price: number; quantity: number }
type Order = {
  id: number
  customerName: string
  phone: string
  address: string
  deliveryDate: string
  deliverySlot: string
  paymentMethod: string
  status: string
  total: number
  notes: string | null
  items: OrderItem[]
}
type Summary = {
  totalOrders: number
  totalRevenue: number
  cashPending: number
  transferPending: number
}

export function AdminDashboard({
  date,
  orders,
  summary,
}: {
  date: string
  orders: Order[]
  summary: Summary
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function changeDate(value: string) {
    router.push(`/admin?date=${value}`)
  }

  function runStatus(id: number, status: OrderStatus) {
    startTransition(async () => {
      try {
        await updateOrderStatus(id, status)
        toast.success("Estado actualizado")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar el estado")
      }
    })
  }

  const stats = [
    { label: "Pedidos del día", value: summary.totalOrders, icon: Package },
    { label: "Facturación", value: formatPrice(summary.totalRevenue), icon: DollarSign },
    { label: "A cobrar (efectivo)", value: formatPrice(summary.cashPending), icon: Banknote },
    { label: "Transferencias a validar", value: summary.transferPending, icon: ClipboardCheck },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold">Panel de pedidos</h1>
          <p className="text-sm text-muted-foreground">Gestioná las entregas y los pagos del día.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="date" className="text-xs font-medium text-muted-foreground">
              Recorrido del día
            </label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => changeDate(e.target.value)}
              className="w-44"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <s.icon className="size-4" />
              <span className="text-xs">{s.label}</span>
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-serif text-lg font-bold">
        Recorrido de entregas ({orders.length})
      </h2>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          No hay pedidos para esta fecha.
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {orders.map((o, idx) => (
            <li key={o.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold">
                      {o.customerName}{" "}
                      <span className="text-muted-foreground">· #{formatOrderNumber(o.id)}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="size-3.5" />
                      {DELIVERY_SLOT_LABEL[o.deliverySlot as DeliverySlot] ?? o.deliverySlot}
                    </p>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(o.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <MapPin className="size-3.5" /> {o.address}
                    </a>
                    <a
                      href={`tel:${o.phone}`}
                      className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="size-3.5" /> {o.phone}
                    </a>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-lg font-bold tabular-nums">{formatPrice(o.total)}</span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge variant={o.paymentMethod === "efectivo" ? "outline" : "secondary"} className="gap-1">
                      {o.paymentMethod === "efectivo" ? (
                        <Banknote className="size-3" />
                      ) : (
                        <Landmark className="size-3" />
                      )}
                      {o.paymentMethod === "efectivo" ? "Efectivo" : "Transferencia"}
                    </Badge>
                  </div>
                </div>
              </div>

              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-y border-border py-2 text-sm text-muted-foreground">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-medium text-foreground">{it.quantity}×</span> {it.name}
                  </li>
                ))}
              </ul>

              {o.notes && (
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Nota:</span> {o.notes}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(o.status as OrderStatus)}>
                  {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                </Badge>

                <div className="ml-auto flex flex-wrap gap-2">
                  {nextStatuses(o.paymentMethod as PaymentMethod, o.status as OrderStatus).map((to) => (
                    <Button
                      key={to}
                      size="sm"
                      variant={to === "cancelado" ? "outline" : "default"}
                      disabled={pending}
                      onClick={() => runStatus(o.id, to)}
                    >
                      {transitionLabel(o.paymentMethod as PaymentMethod, to)}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
