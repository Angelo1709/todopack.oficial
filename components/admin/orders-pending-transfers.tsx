"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useOrderStatusUpdate } from "@/components/admin/orders-status-actions"
import {
  customerWhatsAppUrl,
  orderLabel,
  relativeDayLabel,
  type PendingTransfer,
} from "@/lib/admin-orders-utils"
import { formatDateAR } from "@/lib/dates"
import { formatPrice } from "@/lib/format"
import { DELIVERY_SLOT_LABEL, transitionLabel } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { ChevronDown, Landmark, MessageCircle } from "lucide-react"

/** Aviso global: transferencias sin validar de cualquier fecha, con "Validar pago" a mano. */
export function OrdersPendingTransfers({ transfers, today }: { transfers: PendingTransfer[]; today: string }) {
  const [open, setOpen] = useState(transfers.length <= 3)
  if (transfers.length === 0) return null

  const n = transfers.length
  return (
    <section className="rounded-xl border border-primary/40 bg-primary/5 p-4">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="transferencias-lista"
          className="flex w-full items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Landmark className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              Tenés {n} {n === 1 ? "transferencia" : "transferencias"} por validar
            </span>
            <span className="block text-sm text-muted-foreground">
              Chequeá el comprobante que te mandó el cliente por WhatsApp.
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
            <span className="hidden sm:inline">{open ? "Ocultar" : "Ver"}</span>
            <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </h2>

      {open && (
        <ul id="transferencias-lista" className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
          {transfers.map((t) => (
            <PendingTransferRow key={t.id} transfer={t} today={today} />
          ))}
        </ul>
      )}
    </section>
  )
}

function PendingTransferRow({ transfer: t, today }: { transfer: PendingTransfer; today: string }) {
  const { pending, run } = useOrderStatusUpdate()
  const overdue = t.deliveryDate < today
  const day = relativeDayLabel(t.deliveryDate, today) ?? formatDateAR(t.deliveryDate)

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {t.customerName} <span className="text-muted-foreground tabular-nums">· {orderLabel(t.id)}</span>
        </p>
        <Link
          href={`/admin?date=${t.deliveryDate}&estado=por_validar`}
          scroll={false}
          className={cn(
            "text-xs hover:underline",
            overdue ? "font-medium text-destructive" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {overdue ? "Atrasado · " : "Entrega "}
          {day} · {DELIVERY_SLOT_LABEL[t.deliverySlot]}
        </Link>
      </div>
      <span className="text-sm font-bold tabular-nums">{formatPrice(t.total)}</span>
      <div className="flex w-full gap-2 sm:w-auto">
        {t.phone && (
          <Button
            variant="outline"
            size="icon-lg"
            className="shrink-0 sm:size-8"
            render={<a href={customerWhatsAppUrl(t)} target="_blank" rel="noreferrer" />}
            nativeButton={false}
            aria-label={`Escribirle a ${t.customerName} por WhatsApp`}
          >
            <MessageCircle />
          </Button>
        )}
        <Button className="h-9 flex-1 px-3 sm:h-8 sm:flex-none" disabled={pending} onClick={() => run(t.id, "pagado")}>
          {pending && <Spinner aria-label="Validando" />}
          {pending ? "Validando..." : transitionLabel("transferencia", "pagado")}
        </Button>
      </div>
    </li>
  )
}
