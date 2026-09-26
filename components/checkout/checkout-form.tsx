"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useCart } from "@/components/cart/cart-provider"
import { formatPrice } from "@/lib/format"
import { createOrder } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Banknote, Landmark, Check, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

const BANK_INFO = {
  alias: "todopack.alcorta",
  cbu: "0000003100000000000000",
  titular: "TodoPack Alcorta",
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function CheckoutForm({
  defaults,
}: {
  defaults: { name: string; phone: string; address: string }
}) {
  const router = useRouter()
  const { items, total, clear } = useCart()
  const [method, setMethod] = useState<"efectivo" | "transferencia">("efectivo")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<{ orderId: number } | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (items.length === 0) {
      toast.error("Tu carrito está vacío")
      return
    }
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    try {
      const res = await createOrder({
        items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
        customerName: String(fd.get("name") || ""),
        phone: String(fd.get("phone") || ""),
        address: String(fd.get("address") || ""),
        deliveryDate: String(fd.get("deliveryDate") || ""),
        paymentMethod: method,
        paymentProofUrl: String(fd.get("paymentProofUrl") || ""),
        notes: String(fd.get("notes") || ""),
      })
      clear()
      setDone({ orderId: res.orderId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos crear el pedido")
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
          <Check className="size-7" />
        </div>
        <h1 className="font-serif text-2xl font-bold">¡Pedido recibido!</h1>
        <p className="mt-2 text-muted-foreground">
          Tu pedido <span className="font-semibold text-foreground">#{done.orderId}</span> fue registrado.
          {method === "transferencia"
            ? " Validaremos tu transferencia y te confirmamos la entrega."
            : " Coordinaremos la entrega y cobramos en efectivo al recibir."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button render={<Link href="/" />} nativeButton={false} variant="outline">
            Seguir comprando
          </Button>
          <Button render={<Link href="/mis-pedidos" />} nativeButton={false}>
            Ver mis pedidos
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver al catálogo
      </Link>
      <h1 className="mb-6 font-serif text-2xl font-bold">Finalizar pedido</h1>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <p>Tu carrito está vacío.</p>
          <Button render={<Link href="/" />} nativeButton={false} className="mt-4">
            Ir al catálogo
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">Datos de entrega</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="name">Nombre y apellido</Label>
                  <Input id="name" name="name" defaultValue={defaults.name} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="deliveryDate">Fecha de entrega</Label>
                  <Input
                    id="deliveryDate"
                    name="deliveryDate"
                    type="date"
                    min={todayStr()}
                    defaultValue={todayStr()}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input id="address" name="address" defaultValue={defaults.address} required />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Textarea id="notes" name="notes" rows={2} placeholder="Referencias, horario preferido..." />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">Medio de pago</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMethod("efectivo")}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    method === "efectivo" ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <Banknote className="size-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Efectivo</p>
                    <p className="text-xs text-muted-foreground">Pagás al recibir</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("transferencia")}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    method === "transferencia" ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <Landmark className="size-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Transferencia</p>
                    <p className="text-xs text-muted-foreground">Enviás comprobante</p>
                  </div>
                </button>
              </div>

              {method === "transferencia" && (
                <div className="mt-4 rounded-lg bg-muted p-4 text-sm">
                  <p className="mb-2 font-medium">Datos para transferir</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                    <dt>Alias</dt>
                    <dd className="font-mono text-foreground">{BANK_INFO.alias}</dd>
                    <dt>CBU</dt>
                    <dd className="font-mono text-foreground">{BANK_INFO.cbu}</dd>
                    <dt>Titular</dt>
                    <dd className="text-foreground">{BANK_INFO.titular}</dd>
                  </dl>
                  <div className="mt-4 flex flex-col gap-1.5">
                    <Label htmlFor="paymentProofUrl">Link del comprobante (opcional)</Label>
                    <Input
                      id="paymentProofUrl"
                      name="paymentProofUrl"
                      type="url"
                      placeholder="https://..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Podés pegar el link del comprobante. Un operador validará el pago antes de la entrega.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">Tu pedido</h2>
              <ul className="mb-4 flex max-h-64 flex-col gap-2 overflow-y-auto">
                {items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="line-clamp-1">{i.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {i.quantity} × {formatPrice(i.price)}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatPrice(i.price * i.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-border pt-3 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(total)}</span>
              </div>
              <Button type="submit" size="lg" className="mt-4 w-full" disabled={loading}>
                {loading ? "Enviando..." : "Confirmar pedido"}
              </Button>
            </div>
          </aside>
        </form>
      )}
    </div>
  )
}
