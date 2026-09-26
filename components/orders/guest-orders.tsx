"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getOrdersByTokens, type OrderSummary } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { OrderCard } from "@/components/orders/order-card"
import { forgetOrderTokens, getRememberedOrderTokens } from "@/lib/guest-orders"
import { Package, UserRound } from "lucide-react"

type State = { status: "loading" } | { status: "ready"; orders: OrderSummary[] } | { status: "error" }

/** Pedidos hechos sin cuenta desde este navegador (tokens en localStorage). */
export function GuestOrders() {
  const [state, setState] = useState<State>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    const tokens = getRememberedOrderTokens()
    if (tokens.length === 0) {
      setState({ status: "ready", orders: [] })
      return
    }
    getOrdersByTokens(tokens)
      .then((orders) => {
        if (cancelled) return
        const found = new Set(orders.map((o) => o.publicToken))
        forgetOrderTokens(tokens.filter((t) => !found.has(t)))
        setState({ status: "ready", orders })
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <UserRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">¿Tenés cuenta?</h2>
          <p className="text-sm text-muted-foreground">
            Ingresá para ver todos tus pedidos desde cualquier dispositivo. Los que hiciste acá se suman a tu cuenta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="/sign-in?next=/mis-pedidos" />} nativeButton={false}>
            Ingresar
          </Button>
          <Button render={<Link href="/sign-up?next=/mis-pedidos" />} nativeButton={false} variant="outline">
            Crear cuenta
          </Button>
        </div>
      </section>

      {state.status === "loading" ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando pedidos">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      ) : state.status === "error" ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Package className="size-10 opacity-40" />
          <p>No pudimos cargar tus pedidos. Probá de nuevo en un rato.</p>
        </div>
      ) : state.orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Package className="size-10 opacity-40" />
          <p>Todavía no hiciste pedidos desde este dispositivo.</p>
          <Button render={<Link href="/" />} nativeButton={false} className="mt-2">
            Ir al catálogo
          </Button>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">Pedidos que hiciste desde este dispositivo:</p>
          <ul className="flex flex-col gap-4">
            {state.orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
