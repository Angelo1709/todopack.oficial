import Link from "next/link"
import { getSessionUser } from "@/lib/session"
import { getMyOrders } from "@/app/actions/orders"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { OrderCard } from "@/components/orders/order-card"
import { GuestOrders } from "@/components/orders/guest-orders"
import { Package } from "lucide-react"

export const dynamic = "force-dynamic"

// Con sesión: pedidos de la cuenta. Sin sesión: los pedidos hechos desde este navegador.
export default async function MyOrdersPage() {
  const user = await getSessionUser()
  const orders = user ? await getMyOrders() : null

  return (
    <main className="min-h-dvh bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-6 font-serif text-2xl font-bold">Mis pedidos</h1>

        {!orders ? (
          <GuestOrders />
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
            <Package className="size-10 opacity-40" />
            <p>Todavía no hiciste pedidos.</p>
            <Button render={<Link href="/" />} nativeButton={false} className="mt-2">
              Ir al catálogo
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
