"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { lineTotal, useCart } from "@/components/cart/cart-provider"
import { formatPrice } from "@/lib/format"
import { createOrder, type CheckoutField, type CreatedOrder } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { CopyButton } from "@/components/checkout/copy-button"
import { OrderSuccess } from "@/components/checkout/order-success"
import { rememberOrderToken, type SignUpPrefill } from "@/lib/guest-orders"
import { describeBreakdown, describeQuantity, priceFor } from "@/lib/pricing"
import {
  DELIVERY_SLOTS,
  DELIVERY_SLOT_LABEL,
  type DeliverySlot,
  type PaymentMethod,
} from "@/lib/order-status"
import { toast } from "sonner"
import { ArrowLeft, Banknote, Landmark, Moon, ShoppingCart, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

type Errors = Partial<Record<CheckoutField, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SLOT_ICON: Record<DeliverySlot, typeof Sun> = { mediodia: Sun, noche: Moon }

const PAYMENT_OPTIONS: { value: PaymentMethod; title: string; help: string; icon: typeof Banknote }[] = [
  { value: "efectivo", title: "Efectivo", help: "Pagás al recibir", icon: Banknote },
  { value: "transferencia", title: "Transferencia", help: "Mandás el comprobante por WhatsApp", icon: Landmark },
]

// Orden en que se enfoca el primer campo con error.
const FIELD_ORDER: CheckoutField[] = [
  "customerName",
  "phone",
  "email",
  "deliveryDate",
  "deliverySlot",
  "address",
  "notes",
  "paymentMethod",
]

function optionClass(active: boolean, invalid = false) {
  return cn(
    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
    active ? "border-primary bg-primary/5" : invalid ? "border-destructive" : "border-border hover:bg-muted/50",
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  )
}

export function CheckoutForm({
  defaults,
  bank,
  whatsappNumber,
  isGuest,
  minDate,
}: {
  defaults: { name: string; phone: string; email: string; address: string }
  bank: { alias: string; cbu: string; holder: string }
  whatsappNumber: string
  isGuest: boolean
  /** Hoy en hora argentina (yyyy-mm-dd), calculado en el servidor. */
  minDate: string
}) {
  const { items, total, clear, remove } = useCart()
  const [mounted, setMounted] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>("efectivo")
  const [slot, setSlot] = useState<DeliverySlot | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<{ order: CreatedOrder; contact: SignUpPrefill } | null>(null)

  // El carrito se lee de localStorage al montar: evitamos mostrar "carrito vacío" antes de tiempo.
  useEffect(() => setMounted(true), [])

  function clearError(field: string) {
    if (field in errors) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field as CheckoutField]
        return next
      })
    }
  }

  function showErrors(next: Errors) {
    setErrors(next)
    const first = FIELD_ORDER.find((f) => next[f])
    if (!first) return
    toast.error(next[first])
    const el = document.getElementById(first === "deliverySlot" ? "slot-mediodia" : first)
    el?.focus()
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    if (items.length === 0) {
      toast.error("Tu carrito está vacío")
      return
    }

    const fd = new FormData(e.currentTarget)
    const values = {
      customerName: String(fd.get("customerName") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      address: String(fd.get("address") ?? "").trim(),
      deliveryDate: String(fd.get("deliveryDate") ?? ""),
      notes: String(fd.get("notes") ?? "").trim(),
    }

    const next: Errors = {}
    if (!values.customerName) next.customerName = "Completá tu nombre y apellido"
    const digits = values.phone.replace(/\D/g, "").length
    if (!values.phone) next.phone = "Completá tu teléfono"
    else if (digits < 8 || digits > 15) next.phone = "Revisá el teléfono: tiene que tener al menos 8 números"
    if (values.email && !EMAIL_RE.test(values.email)) next.email = "Revisá el email"
    if (!values.deliveryDate) next.deliveryDate = "Elegí la fecha de entrega"
    else if (values.deliveryDate < minDate) next.deliveryDate = "La fecha de entrega no puede ser en el pasado"
    if (!slot) next.deliverySlot = "Elegí la franja de entrega"
    if (!values.address) next.address = "Completá la dirección de entrega"
    if (Object.keys(next).length > 0 || !slot) {
      showErrors(next)
      return
    }

    setLoading(true)
    try {
      const res = await createOrder({
        items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
        ...values,
        deliverySlot: slot,
        paymentMethod: method,
      })
      if (!res.ok) {
        res.unavailableIds?.forEach((id) => remove(id))
        if (res.field && res.field !== "items") showErrors({ [res.field]: res.error })
        else toast.error(res.error)
        setLoading(false)
        return
      }
      // Solo recordamos en el navegador los pedidos sin cuenta (los de la cuenta se ven al ingresar).
      if (isGuest) rememberOrderToken(res.order.publicToken)
      clear()
      setDone({
        order: res.order,
        contact: { name: values.customerName, phone: values.phone, email: values.email, address: values.address },
      })
      window.scrollTo({ top: 0 })
    } catch {
      toast.error("No pudimos enviar el pedido. Revisá tu conexión e intentá de nuevo.")
      setLoading(false)
    }
  }

  if (done) {
    return (
      <OrderSuccess order={done.order} whatsappNumber={whatsappNumber} isGuest={isGuest} contact={done.contact} />
    )
  }

  const hasBankInfo = Boolean(bank.alias || bank.cbu || bank.holder)

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver al catálogo
      </Link>
      <h1 className="font-serif text-2xl font-bold">Finalizar pedido</h1>
      {isGuest ? (
        <p className="mt-1 text-sm text-muted-foreground">
          No hace falta tener cuenta.{" "}
          <Link
            href="/sign-in?next=/checkout"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Ingresá
          </Link>{" "}
          si ya tenés una y completamos tus datos.
        </p>
      ) : null}

      {!mounted ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <ShoppingCart className="size-10 opacity-40" />
          <p>Tu carrito está vacío.</p>
          <Button render={<Link href="/" />} nativeButton={false} className="mt-2">
            Ir al catálogo
          </Button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          onInput={(e) => clearError((e.target as HTMLInputElement).name)}
          noValidate
          className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"
        >
          <div className="flex flex-col gap-6">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">Datos de entrega</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="customerName">Nombre y apellido</Label>
                  <Input
                    id="customerName"
                    name="customerName"
                    defaultValue={defaults.name}
                    autoComplete="name"
                    maxLength={120}
                    required
                    aria-invalid={errors.customerName ? true : undefined}
                    aria-describedby={errors.customerName ? "customerName-error" : undefined}
                  />
                  <FieldError id="customerName-error" message={errors.customerName} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    defaultValue={defaults.phone}
                    autoComplete="tel"
                    placeholder="341 555-1234"
                    maxLength={30}
                    required
                    aria-invalid={errors.phone ? true : undefined}
                    aria-describedby={errors.phone ? "phone-error" : "phone-help"}
                  />
                  {errors.phone ? (
                    <FieldError id="phone-error" message={errors.phone} />
                  ) : (
                    <p id="phone-help" className="text-xs text-muted-foreground">
                      Con código de área. Te escribimos si hace falta coordinar.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">
                    Email <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    defaultValue={defaults.email}
                    autoComplete="email"
                    maxLength={200}
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  <FieldError id="email-error" message={errors.email} />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    name="address"
                    defaultValue={defaults.address}
                    autoComplete="street-address"
                    placeholder="Calle, número, piso/depto y localidad"
                    maxLength={300}
                    required
                    aria-invalid={errors.address ? true : undefined}
                    aria-describedby={errors.address ? "address-error" : undefined}
                  />
                  <FieldError id="address-error" message={errors.address} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="deliveryDate">Fecha de entrega</Label>
                  <Input
                    id="deliveryDate"
                    name="deliveryDate"
                    type="date"
                    min={minDate}
                    defaultValue={minDate}
                    required
                    aria-invalid={errors.deliveryDate ? true : undefined}
                    aria-describedby={errors.deliveryDate ? "deliveryDate-error" : undefined}
                  />
                  <FieldError id="deliveryDate-error" message={errors.deliveryDate} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span id="slot-label" className="text-sm font-medium leading-none">
                    Franja de entrega
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby="slot-label"
                    aria-describedby={errors.deliverySlot ? "deliverySlot-error" : undefined}
                    className="grid grid-cols-2 gap-2"
                  >
                    {DELIVERY_SLOTS.map((value) => {
                      const Icon = SLOT_ICON[value]
                      const active = slot === value
                      return (
                        <button
                          key={value}
                          id={`slot-${value}`}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            setSlot(value)
                            clearError("deliverySlot")
                          }}
                          className={cn(optionClass(active, Boolean(errors.deliverySlot)), "h-8 py-0")}
                        >
                          <Icon className="size-4 text-primary" />
                          <span className="text-sm font-medium">{DELIVERY_SLOT_LABEL[value]}</span>
                        </button>
                      )
                    })}
                  </div>
                  <FieldError id="deliverySlot-error" message={errors.deliverySlot} />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="notes">
                    Notas <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    maxLength={1000}
                    placeholder="Referencias para encontrar la dirección, timbre, entre calles..."
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">Medio de pago</h2>
              <div role="radiogroup" aria-label="Medio de pago" className="grid gap-3 sm:grid-cols-2">
                {PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={method === opt.value}
                    onClick={() => setMethod(opt.value)}
                    className={optionClass(method === opt.value)}
                  >
                    <opt.icon className="size-5 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium">{opt.title}</span>
                      <span className="block text-xs text-muted-foreground">{opt.help}</span>
                    </span>
                  </button>
                ))}
              </div>

              {method === "transferencia" && (
                <div className="mt-4 rounded-lg bg-muted p-4 text-sm">
                  <p className="mb-2 font-medium">Datos para transferir</p>
                  {hasBankInfo ? (
                    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-muted-foreground">
                      {bank.alias && (
                        <>
                          <dt>Alias</dt>
                          <dd className="flex min-w-0 items-center gap-1">
                            <span className="break-all font-mono tracking-tight text-foreground">{bank.alias}</span>
                            <CopyButton value={bank.alias} label="alias" />
                          </dd>
                        </>
                      )}
                      {bank.cbu && (
                        <>
                          <dt>CBU</dt>
                          <dd className="flex min-w-0 items-center gap-1">
                            <span className="break-all font-mono tracking-tight text-foreground">{bank.cbu}</span>
                            <CopyButton value={bank.cbu} label="CBU" />
                          </dd>
                        </>
                      )}
                      {bank.holder && (
                        <>
                          <dt>Titular</dt>
                          <dd className="py-1 text-foreground">{bank.holder}</dd>
                        </>
                      )}
                    </dl>
                  ) : (
                    <p className="text-muted-foreground">Pedinos los datos bancarios por WhatsApp.</p>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Transferí el total y, al confirmar el pedido, te damos un botón para mandarnos el comprobante
                    por WhatsApp.
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">Tu pedido</h2>
              <ul className="mb-4 flex max-h-64 flex-col gap-2 overflow-y-auto">
                {items.map((i) => {
                  const breakdown = priceFor(i.tiers, i.quantity)
                  return (
                    <li key={i.id} className="flex justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="line-clamp-1">{i.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {describeQuantity(i.tiers, i.quantity)}
                          {breakdown && breakdown.lines.length > 1 ? ` · ${describeBreakdown(breakdown)}` : null}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">{formatPrice(lineTotal(i))}</span>
                    </li>
                  )
                })}
              </ul>
              <div className="flex items-center justify-between border-t border-border pt-3 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(total)}</span>
              </div>
              <Button type="submit" size="lg" className="mt-4 w-full" disabled={loading}>
                {loading ? "Enviando..." : "Confirmar pedido"}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {method === "transferencia"
                  ? "Validamos la transferencia cuando nos mandes el comprobante."
                  : "Pagás en efectivo cuando recibís el pedido."}
              </p>
            </div>
          </aside>
        </form>
      )}
    </div>
  )
}
