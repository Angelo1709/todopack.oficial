"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  createManualOrder,
  searchProductsForOrder,
  type ManualOrderField,
  type OrderProductOption,
} from "@/app/actions/admin-orders"
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
import { formatPrice } from "@/lib/format"
import {
  DELIVERY_SLOTS,
  DELIVERY_SLOT_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type DeliverySlot,
  type PaymentMethod,
} from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { Banknote, Landmark, Moon, Plus, Search, Sun, X } from "lucide-react"

const SLOT_ICON = { mediodia: Sun, noche: Moon } as const
const PAYMENT_ICON = { efectivo: Banknote, transferencia: Landmark } as const
const PAYMENT_HELP: Record<PaymentMethod, string> = {
  efectivo: "Se cobra al entregar",
  transferencia: "Queda para validar el pago",
}

type Errors = Partial<Record<ManualOrderField, string>>

/** Renglón del pedido: cantidad y precio quedan como texto mientras se editan. */
type Line = {
  productId: number
  name: string
  label: string
  listPrice: number
  quantity: string
  price: string
}

/** "15.000", "$ 15000" o "15000,50" -> 15000; null si no es un importe (igual que en el servidor). */
function parseAmount(value: string): number | null {
  const clean = value.trim().replace(/[$\s.]/g, "").replace(/,\d{0,2}$/, "")
  if (!clean) return null
  return /^\d+$/.test(clean) ? Number(clean) : null
}

function lineTotal(line: Line): number | null {
  const qty = Number(line.quantity)
  const price = parseAmount(line.price)
  return Number.isInteger(qty) && qty > 0 && price !== null ? qty * price : null
}

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
  const [lines, setLines] = useState<Line[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<OrderProductOption[]>([])
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()

  // Busca productos mientras se escribe (con una pausa corta para no consultar en cada tecla).
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const found = await searchProductsForOrder(q)
        if (!cancelled) setResults(found)
      } catch {
        if (!cancelled) toast.error("No pudimos buscar productos. Revisá la conexión y probá de nuevo.")
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  function addProduct(p: OrderProductOption) {
    setLines((current) => {
      const existing = current.find((l) => l.productId === p.id)
      if (existing) {
        const qty = Number(existing.quantity)
        return current.map((l) =>
          l.productId === p.id ? { ...l, quantity: String(Number.isInteger(qty) && qty > 0 ? qty + 1 : 1) } : l,
        )
      }
      return [
        ...current,
        { productId: p.id, name: p.name, label: p.label, listPrice: p.price, quantity: "1", price: String(p.price) },
      ]
    })
    setQuery("")
    setResults([])
    clearError("items")
  }

  function updateLine(productId: number, change: Partial<Pick<Line, "quantity" | "price">>) {
    setLines((current) => current.map((l) => (l.productId === productId ? { ...l, ...change } : l)))
    clearError("items")
  }

  function removeLine(productId: number) {
    setLines((current) => current.filter((l) => l.productId !== productId))
    clearError("items")
  }

  const linesTotal = lines.reduce<number | null>((sum, l) => {
    const t = lineTotal(l)
    return sum === null || t === null ? null : sum + t
  }, 0)
  // Arranca en el día que se está mirando (o hoy, si ese día ya pasó).
  const defaultDate = filters.date < today ? today : filters.date

  function reset() {
    setSlot(filters.slot === "todas" ? null : filters.slot)
    setMethod("efectivo")
    setErrors({})
    setLines([])
    setQuery("")
    setResults([])
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
    const badLine = lines.find((l) => lineTotal(l) === null)
    if (badLine) missing.items = `Revisá la cantidad y el precio de ${badLine.name}`
    if (Object.keys(missing).length > 0 || !slot) {
      setErrors(missing)
      return
    }

    startTransition(async () => {
      try {
        const result = await createManualOrder({
          ...values,
          deliverySlot: slot,
          paymentMethod: method,
          items: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), price: l.price })),
        })
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
        setLines([])
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
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

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="mo-product-search">
              Productos <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="mo-product-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter agrega el primer resultado (y no manda el formulario).
                  if (e.key === "Enter") {
                    e.preventDefault()
                    if (results[0]) addProduct(results[0])
                  }
                }}
                autoComplete="off"
                placeholder="Buscá por nombre: coca 1.5 pack"
                aria-describedby={errors.items ? "mo-items-error" : undefined}
                className="h-9 pl-8"
              />
              {searching && (
                <Spinner aria-label="Buscando" className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground" />
              )}
            </div>
            {results.length > 0 && (
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-border" aria-label="Resultados">
                {results.map((p) => (
                  <li key={p.id} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <Plus className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-tight">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">{p.label}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPrice(p.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay productos con ese nombre.</p>
            )}

            {lines.length > 0 && (
              <ul className="flex flex-col gap-2">
                {lines.map((l) => {
                  const subtotal = lineTotal(l)
                  const price = parseAmount(l.price)
                  return (
                    <li key={l.productId} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight">{l.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.label}
                            {price !== null && price !== l.listPrice && (
                              <span className="tabular-nums"> · lista {formatPrice(l.listPrice)}</span>
                            )}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground"
                          onClick={() => removeLine(l.productId)}
                          aria-label={`Sacar ${l.name}`}
                        >
                          <X />
                        </Button>
                      </div>
                      <div className="mt-2 flex items-end gap-2">
                        <div className="flex w-20 flex-col gap-1">
                          <Label htmlFor={`mo-qty-${l.productId}`} className="text-xs font-normal text-muted-foreground">
                            Cantidad
                          </Label>
                          <Input
                            id={`mo-qty-${l.productId}`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={l.quantity}
                            onChange={(e) => updateLine(l.productId, { quantity: e.target.value })}
                            aria-invalid={Number.isInteger(Number(l.quantity)) && Number(l.quantity) > 0 ? undefined : true}
                            className="h-9 tabular-nums"
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <Label htmlFor={`mo-price-${l.productId}`} className="text-xs font-normal text-muted-foreground">
                            Precio {l.label.toLowerCase()}
                          </Label>
                          <Input
                            id={`mo-price-${l.productId}`}
                            inputMode="numeric"
                            autoComplete="off"
                            value={l.price}
                            onChange={(e) => updateLine(l.productId, { price: e.target.value })}
                            aria-invalid={price === null ? true : undefined}
                            className="h-9 tabular-nums"
                          />
                        </div>
                        <p className="w-24 shrink-0 pb-2 text-right text-sm font-semibold tabular-nums">
                          {subtotal === null ? "—" : formatPrice(subtotal)}
                        </p>
                      </div>
                    </li>
                  )
                })}
                <li className="flex items-baseline justify-between px-1 pt-1">
                  <span className="text-sm text-muted-foreground">Total a cobrar</span>
                  <span className="text-base font-bold tabular-nums">
                    {linesTotal === null ? "—" : formatPrice(linesTotal)}
                  </span>
                </li>
              </ul>
            )}
            <FieldError id="mo-items-error" message={errors.items} />
          </div>

          <div className={cn("flex flex-col gap-1.5", lines.length > 0 && "hidden")}>
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
                Lo que tiene que cobrar el repartidor, si no cargás productos.
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
              placeholder="Timbre, entre calles, aclaraciones..."
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
