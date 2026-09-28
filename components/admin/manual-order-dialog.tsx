"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { createManualOrder, type ManualOrderField } from "@/app/actions/admin-orders"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { adminOrdersHref, orderLabel, type AdminFilters } from "@/lib/admin-orders-utils"
import { formatDateAR } from "@/lib/dates"
import {
  DELIVERY_SLOTS,
  DELIVERY_SLOT_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type DeliverySlot,
  type PaymentMethod,
} from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { Banknote, Landmark, Moon, Plus, Sun } from "lucide-react"

const SLOT_ICON = { mediodia: Sun, noche: Moon } as const
const PAYMENT_ICON = { efectivo: Banknote, transferencia: Landmark } as const
const PAYMENT_HELP: Record<PaymentMethod, string> = {
  efectivo: "Se cobra al entregar",
  transferencia: "Queda para validar el pago",
}

type Errors = Partial<Record<ManualOrderField, string>>

function optionClass(active: boolean, invalid?: boolean) {
  return cn(
    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
    invalid && !active && "border-destructive",
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

/**
 * "Agregar pedido": pedido tomado por teléfono o en el local. Entra a la lista del día junto con los de la
 * web y al recorrido de reparto. `filters` da la fecha y la franja con las que arranca el formulario.
 */
export function ManualOrderDialog({ filters, today }: { filters: AdminFilters; today: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [slot, setSlot] = useState<DeliverySlot | null>(null)
  const [method, setMethod] = useState<PaymentMethod>("efectivo")
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()
  // Arranca en el día que se está mirando (o hoy, si ese día ya pasó).
  const defaultDate = filters.date < today ? today : filters.date

  function reset() {
    setSlot(filters.slot === "todas" ? null : filters.slot)
    setMethod("efectivo")
    setErrors({})
  }

  function clearError(field: ManualOrderField) {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const values = {
      customerName: String(fd.get("customerName") ?? ""),
      address: String(fd.get("address") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      deliveryDate: String(fd.get("deliveryDate") ?? ""),
      total: String(fd.get("total") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    }

    const missing: Errors = {}
    if (!values.customerName.trim()) missing.customerName = "Completá el nombre del cliente"
    if (!values.address.trim()) missing.address = "Completá la dirección de entrega"
    if (!slot) missing.deliverySlot = "Elegí la franja de entrega"
    if (Object.keys(missing).length > 0 || !slot) {
      setErrors(missing)
      return
    }

    startTransition(async () => {
      try {
        const result = await createManualOrder({ ...values, deliverySlot: slot, paymentMethod: method })
        if (!result.ok) {
          setErrors(result.field ? { [result.field]: result.error } : {})
          toast.error(result.error)
          return
        }
        const otherDay = result.deliveryDate !== filters.date
        toast.success(
          `Pedido ${orderLabel(result.id)} agregado${otherDay ? ` para el ${formatDateAR(result.deliveryDate)}` : ""}`,
          {
            description: result.located
              ? undefined
              : "No encontramos la dirección en el mapa: ubicala desde la pestaña Recorrido.",
          },
        )
        form.reset()
        setOpen(false)
        if (otherDay) router.push(adminOrdersHref(filters, { date: result.deliveryDate }), { scroll: false })
      } catch {
        toast.error("No pudimos agregar el pedido. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset()
        setOpen(next)
      }}
    >
      <DialogTrigger render={<Button className="h-9 w-full px-3 sm:w-auto" />}>
        <Plus />
        Agregar pedido
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar pedido</DialogTitle>
          <DialogDescription>
            Para pedidos por teléfono o en el local. Se suma a la lista del día y al recorrido.
          </DialogDescription>
        </DialogHeader>

        <form id="pedido-manual" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mo-customerName">Cliente</Label>
            <Input
              id="mo-customerName"
              name="customerName"
              autoComplete="off"
              maxLength={120}
              placeholder="Nombre y apellido o negocio"
              onChange={() => clearError("customerName")}
              aria-invalid={errors.customerName ? true : undefined}
              aria-describedby={errors.customerName ? "mo-customerName-error" : undefined}
              className="h-9"
            />
            <FieldError id="mo-customerName-error" message={errors.customerName} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mo-phone">
              Teléfono <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="mo-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="3465 123456"
              onChange={() => clearError("phone")}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={errors.phone ? "mo-phone-error" : undefined}
              className="h-9"
            />
            <FieldError id="mo-phone-error" message={errors.phone} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mo-address">Dirección</Label>
            <Input
              id="mo-address"
              name="address"
              autoComplete="off"
              maxLength={300}
              placeholder="Calle y número (y la localidad, si no es Alcorta)"
              onChange={() => clearError("address")}
              aria-invalid={errors.address ? true : undefined}
              aria-describedby={errors.address ? "mo-address-error" : undefined}
              className="h-9"
            />
            <FieldError id="mo-address-error" message={errors.address} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mo-deliveryDate">Fecha de entrega</Label>
            <Input
              id="mo-deliveryDate"
              name="deliveryDate"
              type="date"
              min={today}
              defaultValue={defaultDate}
              onChange={() => clearError("deliveryDate")}
              aria-invalid={errors.deliveryDate ? true : undefined}
              aria-describedby={errors.deliveryDate ? "mo-deliveryDate-error" : undefined}
              className="h-9"
            />
            <FieldError id="mo-deliveryDate-error" message={errors.deliveryDate} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id="mo-slot-label" className="text-sm font-medium leading-none">
              Franja
            </span>
            <div
              role="radiogroup"
              aria-labelledby="mo-slot-label"
              aria-describedby={errors.deliverySlot ? "mo-deliverySlot-error" : undefined}
              className="grid grid-cols-2 gap-2"
            >
              {DELIVERY_SLOTS.map((value) => {
                const Icon = SLOT_ICON[value]
                const active = slot === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setSlot(value)
                      clearError("deliverySlot")
                    }}
                    className={cn(optionClass(active, Boolean(errors.deliverySlot)), "h-9 py-0")}
                  >
                    <Icon className="size-4 text-primary" />
                    <span className="text-sm font-medium">{DELIVERY_SLOT_LABEL[value]}</span>
                  </button>
                )
              })}
            </div>
            <FieldError id="mo-deliverySlot-error" message={errors.deliverySlot} />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span id="mo-method-label" className="text-sm font-medium leading-none">
              Medio de pago
            </span>
            <div role="radiogroup" aria-labelledby="mo-method-label" className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((value) => {
                const Icon = PAYMENT_ICON[value]
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={method === value}
                    onClick={() => setMethod(value)}
                    className={optionClass(method === value)}
                  >
                    <Icon className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{PAYMENT_METHOD_LABEL[value]}</span>
                      <span className="block text-xs text-muted-foreground">{PAYMENT_HELP[value]}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mo-total">
              Importe <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="mo-total"
              name="total"
              inputMode="numeric"
              autoComplete="off"
              placeholder="$ 15.000"
              onChange={() => clearError("total")}
              aria-invalid={errors.total ? true : undefined}
              aria-describedby="mo-total-help"
              className="h-9 tabular-nums"
            />
            {errors.total ? (
              <FieldError id="mo-total-help" message={errors.total} />
            ) : (
              <p id="mo-total-help" className="text-xs text-muted-foreground">
                Lo que tiene que cobrar el repartidor.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mo-notes">
              Notas <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="mo-notes"
              name="notes"
              rows={2}
              maxLength={1000}
              placeholder="Qué lleva, timbre, entre calles..."
            />
          </div>
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-10 sm:h-8" />} disabled={pending}>
            Cancelar
          </DialogClose>
          <Button type="submit" form="pedido-manual" className="h-10 sm:h-8" disabled={pending}>
            {pending && <Spinner aria-label="Agregando" />}
            {pending ? "Agregando..." : "Agregar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
