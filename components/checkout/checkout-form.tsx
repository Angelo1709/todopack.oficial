"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { lineTotal, useCart } from "@/components/cart/cart-provider"
import { formatPrice } from "@/lib/format"
import { createOrder, type CheckoutField } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { TransferInstructions } from "@/components/orders/transfer-instructions"
import { rememberOrderToken, saveSignUpPrefill } from "@/lib/guest-orders"
import { EVENTS, track } from "@/lib/analytics"
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
import { useDeliveryBooking } from "@/components/checkout/use-delivery-booking"
import { canBookDelivery,closedDeliveryMessage,dateInArgentina,deliveryCutoff,deliveryWindow,formatCutoff,nextDelivery,validDeliveryDate,type DeliverySettings } from "@/lib/delivery-schedule"

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
    "flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors",
    active
      ? "border-primary bg-primary/10 ring-1 ring-primary"
      : invalid
        ? "border-destructive"
        : "border-border bg-card hover:border-foreground/30",
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

/** Título de sección numerado: el checkout se lee como pasos. */
function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 font-serif text-lg font-semibold">
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-sidebar text-sm font-bold text-sidebar-foreground"
      >
        {n}
      </span>
      {children}
    </h2>
  )
}

export function CheckoutForm({
  defaults,
  bank,
  isGuest,
  minDate:initialMinDate,
  deliverySettings,
  serverNow,
}: {
  defaults: { name: string; phone: string; email: string; address: string }
  bank: { alias: string; cbu: string; holder: string }
  isGuest: boolean
  /** Hoy en hora argentina (yyyy-mm-dd), calculado en el servidor. */
  minDate: string
  deliverySettings:DeliverySettings
  serverNow:number
}) {
  const router = useRouter()
  const { items, total, clear, remove, refresh } = useCart()
  const [mounted, setMounted] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>("efectivo")
  const {values:schedule,now,refreshBooking}=useDeliveryBooking(deliverySettings,serverNow)
  const minDate=dateInArgentina(now) || initialMinDate
  const [deliveryDate,setDeliveryDate]=useState(()=>nextDelivery(deliverySettings,serverNow).date)
  const [slot, setSlot] = useState<DeliverySlot | null>(()=>nextDelivery(deliverySettings,serverNow).slot)
  const [slotNotice,setSlotNotice]=useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)
  const [placed, setPlaced] = useState(false)

  // El carrito se lee de localStorage al montar: evitamos mostrar "carrito vacío" antes de tiempo.
  useEffect(() => setMounted(true), [])

  // Inicio del checkout (paso del embudo): una vez por visita, cuando ya se leyó el carrito.
  const checkoutTracked = useRef(false)
  useEffect(() => {
    if (!mounted || checkoutTracked.current || items.length === 0) return
    checkoutTracked.current = true
    track(EVENTS.checkoutStarted, {
      value: total,
      items_count: items.length,
      units: items.reduce((sum, i) => sum + i.quantity, 0),
    })
  }, [mounted, items, total])
  useEffect(()=>{
    if (slot && !canBookDelivery(schedule,deliveryDate,slot,now)) {
      setSlotNotice(closedDeliveryMessage(schedule,deliveryDate,slot,now))
      setSlot(null)
    }
  },[schedule,deliveryDate,slot,now])
  function chooseDate(date:string) {
    setDeliveryDate(date);setSlotNotice("");clearError("deliveryDate");clearError("deliverySlot")
    setSlot(validDeliveryDate(date) ? DELIVERY_SLOTS.find(s=>canBookDelivery(schedule,date,s,now)) ?? null : null)
  }

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
    else if (!canBookDelivery(schedule,values.deliveryDate,slot,now)) next.deliverySlot=closedDeliveryMessage(schedule,values.deliveryDate,slot,now)
    if (!values.address) next.address = "Completá la dirección de entrega"
    if (Object.keys(next).length > 0 || !slot) {
      showErrors(next)
      return
    }

    setLoading(true)
    try {
      const res = await createOrder({
        expectedTotal: total,
        items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
        ...values,
        deliverySlot: slot,
        deliveryWindow: deliveryWindow(schedule,slot),
        paymentMethod: method,
      })
      if (!res.ok) {
        track(EVENTS.checkoutError, { field: res.field ?? "general", error: res.error })
        if (res.field === "items") await refresh()
        if (res.field==="deliverySlot") await refreshBooking()
        res.unavailableIds?.forEach((id) => remove(id))
        if (res.field && res.field !== "items") showErrors({ [res.field]: res.error })
        else toast.error(res.error)
        setLoading(false)
        return
      }
      // Solo recordamos en el navegador los pedidos sin cuenta (los de la cuenta se ven al ingresar).
      if (isGuest) {
        rememberOrderToken(res.order.publicToken)
        // Para precargar el registro si acepta crear cuenta (sessionStorage, nunca por URL).
        saveSignUpPrefill({ name: values.customerName, phone: values.phone, email: values.email, address: values.address })
      }
      // Venta cerrada desde la tienda: último paso del embudo, con el monto para medir facturación.
      track(EVENTS.orderCompleted, {
        order_id: res.order.id,
        revenue: res.order.total,
        value: res.order.total,
        currency: "ARS",
        payment_method: res.order.paymentMethod,
        delivery_slot: res.order.deliverySlot,
        items_count: items.length,
        units: items.reduce((sum, i) => sum + i.quantity, 0),
        is_guest: isGuest,
      })
      setPlaced(true)
      clear()
      // La confirmación es la página del pedido: si recarga, cierra o vuelve más tarde,
      // sigue viendo el alias y el botón del comprobante.
      router.replace(`/pedido/${res.order.publicToken}?nuevo=1`)
    } catch {
      toast.error("No pudimos enviar el pedido. Revisá tu conexión e intentá de nuevo.")
      setLoading(false)
    }
  }

  if (placed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted-foreground">
        <p className="font-serif text-xl font-bold text-foreground">¡Pedido recibido!</p>
        <p className="mt-2 text-sm">Abriendo tu pedido...</p>
      </div>
    )
  }


  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/"
        className="-ml-1 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-full px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Volver al catálogo
      </Link>
      <h1 className="font-serif text-2xl font-bold sm:text-3xl">Finalizar pedido</h1>
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
          className="store-form mt-6 grid gap-5 pb-28 lg:grid-cols-[1fr_380px] lg:gap-6 lg:pb-0"
        >
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/70">
              <StepTitle n={1}>Datos de entrega</StepTitle>
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
                    value={deliveryDate}
                    onChange={e=>chooseDate(e.target.value)}
                    required
                    aria-invalid={errors.deliveryDate ? true : undefined}
                    aria-describedby={errors.deliveryDate ? "deliveryDate-error" : undefined}
                  />
                  <FieldError id="deliveryDate-error" message={errors.deliveryDate} />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
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
                      const available=canBookDelivery(schedule,deliveryDate,value,now)
                      const cutoff=validDeliveryDate(deliveryDate) ? formatCutoff(deliveryCutoff(schedule,deliveryDate,value),deliveryDate) : ""
                      return (
                        <button
                          key={value}
                          id={`slot-${value}`}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={!available}
                          onClick={() => {
                            setSlot(value)
                            setSlotNotice("")
                            clearError("deliverySlot")
                            track(EVENTS.deliverySlotSelected, { slot: value })
                          }}
                          className={cn(optionClass(active, Boolean(errors.deliverySlot)), "min-w-0 items-start gap-2 p-3 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground")}
                        >
                          <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span className="min-w-0 wrap-anywhere">
                            <span className="block text-sm font-medium">{DELIVERY_SLOT_LABEL[value]}</span>
                            <span className="block text-xs">{deliveryWindow(schedule,value)}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{available ? "Pedí antes de" : "Cerrada · límite"} {cutoff || "elegí una fecha"}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Horarios de Argentina. Anticipación mínima: {schedule.deliveryLeadMinutes} minutos antes del inicio.</p>
                  {slotNotice && <p role="status" className="rounded-lg bg-muted p-3 text-xs">{slotNotice}</p>}
                  {validDeliveryDate(deliveryDate) && !DELIVERY_SLOTS.some(s=>canBookDelivery(schedule,deliveryDate,s,now)) && (
                    <div className="rounded-lg bg-muted p-3 text-xs">
                      <p>Ya cerraron las franjas de esta fecha.</p>
                      <Button type="button" variant="outline" size="sm" className="mt-2 h-auto max-w-full whitespace-normal text-left" onClick={()=>{
                        const next=nextDelivery(schedule,now,deliveryDate);chooseDate(next.date);setSlot(next.slot)
                      }}>Elegir próximo turno disponible</Button>
                    </div>
                  )}
                  {deliveryDate>minDate && <p className="text-xs text-muted-foreground">Entrega programada para el {deliveryDate.split("-").reverse().join("/")}. Podés cambiar la fecha.</p>}
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

            <section className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/70">
              <StepTitle n={2}>Medio de pago</StepTitle>
              <div role="radiogroup" aria-label="Medio de pago" className="grid gap-3 sm:grid-cols-2">
                {PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={method === opt.value}
                    onClick={() => {
                      setMethod(opt.value)
                      track(EVENTS.paymentMethodSelected, { method: opt.value })
                    }}
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
                <div className="mt-4">
                  <TransferInstructions bank={bank} amount={total} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Transferí el total y, al confirmar el pedido, te damos un botón para mandarnos el comprobante
                    por WhatsApp. El alias también queda en la página de tu pedido.
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/70">
              <StepTitle n={3}>Revisá tu pedido</StepTitle>
              <ul className="mb-4 flex max-h-64 flex-col gap-2 overflow-y-auto">
                {items.map((i) => {
                  const breakdown = priceFor(i.tiers, i.quantity)
                  return (
                    <li key={i.id} className="flex justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="block wrap-anywhere">{i.name}</span>
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
              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-serif text-2xl font-bold tabular-nums">{formatPrice(total)}</span>
              </div>
              {slot && <p className="mt-3 text-sm">Entrega: <span className="font-medium">{deliveryDate.split("-").reverse().join("/")} · {DELIVERY_SLOT_LABEL[slot]} · {deliveryWindow(schedule,slot)}</span></p>}
              <Button
                type="submit"
                className="mt-4 hidden h-12 w-full rounded-xl text-base font-semibold lg:inline-flex"
                disabled={loading}
              >
                {loading ? "Enviando..." : "Confirmar pedido"}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {method === "transferencia"
                  ? "Validamos la transferencia cuando nos mandes el comprobante."
                  : "Pagás en efectivo cuando recibís el pedido."}
              </p>
            </div>
          </aside>

          {/* En el celular el botón queda siempre a mano, con el total. */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 shadow-raised backdrop-blur pb-safe lg:hidden">
            <div className="mx-auto flex max-w-5xl items-center gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-serif text-xl font-bold leading-tight tabular-nums">{formatPrice(total)}</p>
              </div>
              <Button type="submit" className="ml-auto h-12 flex-1 rounded-xl text-base font-semibold" disabled={loading}>
                {loading ? "Enviando..." : "Confirmar pedido"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
