"use client"

import Link from "next/link"
import type { CreatedOrder } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { PaymentMethodLabel } from "@/components/orders/order-meta"
import { WhatsappProofButton } from "@/components/orders/whatsapp-proof"
import { formatDateAR } from "@/lib/dates"
import { formatOrderNumber, formatPrice } from "@/lib/format"
import { saveSignUpPrefill, type SignUpPrefill } from "@/lib/guest-orders"
import { DELIVERY_SLOT_LABEL, ORDER_STATUS_LABEL } from "@/lib/order-status"
import { Banknote, Check, UserPlus } from "lucide-react"

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function OrderSuccess({
  order,
  whatsappNumber,
  isGuest,
  contact,
}: {
  order: CreatedOrder
  whatsappNumber: string
  isGuest: boolean
  /** Datos del formulario para precargar el registro (van por sessionStorage, nunca por URL). */
  contact: SignUpPrefill
}) {
  const isTransfer = order.paymentMethod === "transferencia"

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
          <Check className="size-7" />
        </div>
        <h1 className="font-serif text-2xl font-bold">¡Pedido recibido!</h1>
        <p className="mt-2 text-muted-foreground">
          Tu pedido <span className="font-semibold text-foreground">#{formatOrderNumber(order.id)}</span> quedó
          registrado.
        </p>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-right text-base font-bold tabular-nums">{formatPrice(order.total)}</dd>
          <dt className="text-muted-foreground">Entrega</dt>
          <dd className="text-right">
            {capitalize(formatDateAR(order.deliveryDate, { weekday: "long", day: "numeric", month: "long" }))} ·{" "}
            {DELIVERY_SLOT_LABEL[order.deliverySlot]}
          </dd>
          <dt className="text-muted-foreground">Pago</dt>
          <dd className="flex justify-end">
            <PaymentMethodLabel method={order.paymentMethod} />
          </dd>
        </dl>
      </section>

      <div className="mt-4 flex flex-col gap-3">
        {isTransfer ? (
          <>
            <WhatsappProofButton whatsappNumber={whatsappNumber} order={order} />
            <p className="text-center text-sm text-muted-foreground">
              El pedido queda como{" "}
              <span className="font-semibold text-foreground">{ORDER_STATUS_LABEL.pendiente_validacion}</span> hasta
              que confirmemos la transferencia.
            </p>
          </>
        ) : (
          <p className="flex items-center gap-3 rounded-lg bg-muted p-4 text-sm">
            <Banknote className="size-5 shrink-0 text-primary" />
            Pagás en efectivo al recibir el pedido.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button
          render={<Link href={`/pedido/${order.publicToken}`} />}
          nativeButton={false}
          variant={isTransfer ? "outline" : "default"}
          size="lg"
        >
          Ver estado del pedido
        </Button>
        <Button render={<Link href="/" />} nativeButton={false} variant="outline" size="lg">
          Seguir comprando
        </Button>
      </div>

      {isGuest && (
        <section className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-card p-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <UserPlus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">¿Querés crear una cuenta?</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Guardamos tus datos y tus pedidos para la próxima.
            </p>
            <Button
              render={<Link href="/sign-up?next=/mis-pedidos" onClick={() => saveSignUpPrefill(contact)} />}
              nativeButton={false}
              size="sm"
              className="mt-3"
            >
              Crear cuenta
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
