"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { getMyPendingTransfers, type MyPendingTransfer } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { formatOrderNumber, formatPrice } from "@/lib/format"
import { getRememberedOrderTokens } from "@/lib/guest-orders"
import { Landmark, X } from "lucide-react"

const DISMISSED_KEY = "todopack-transfer-notice-dismissed-v1"

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : []
  } catch {
    return []
  }
}

/**
 * Aviso bajo el header mientras haya transferencias sin confirmar: si el cliente cerró la
 * confirmación del pedido, desde acá vuelve al alias y al botón del comprobante por WhatsApp.
 * Se puede cerrar por esta sesión; vuelve a aparecer con un pedido nuevo.
 */
export function PendingTransferNotice({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()
  const [orders, setOrders] = useState<MyPendingTransfer[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  // En el panel no corresponde y en Mis pedidos cada tarjeta ya tiene su botón "Ver alias".
  const hidden = pathname.startsWith("/admin") || pathname === "/mis-pedidos"

  useEffect(() => {
    if (hidden) return
    const tokens = getRememberedOrderTokens()
    if (!tokens.length && !signedIn) return
    setDismissed(readDismissed())
    let cancelled = false
    getMyPendingTransfers(tokens)
      .then((rows) => !cancelled && setOrders(rows))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pathname, signedIn, hidden])

  // En la página del pedido ya están el alias y el botón: no hace falta el aviso de ese pedido.
  const visible = orders.filter((o) => !dismissed.includes(o.publicToken) && pathname !== `/pedido/${o.publicToken}`)
  if (hidden || visible.length === 0) return null

  function dismiss() {
    const next = [...new Set([...dismissed, ...visible.map((o) => o.publicToken)])]
    setDismissed(next)
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const single = visible.length === 1 ? visible[0] : null

  return (
    <div role="status" className="border-b border-primary/30 bg-primary/10">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm">
        <Landmark className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1">
          {single ? (
            <>
              Tu pedido <span className="font-semibold">#{formatOrderNumber(single.id)}</span> espera la
              transferencia de <span className="font-semibold tabular-nums">{formatPrice(single.total)}</span>.
            </>
          ) : (
            <>
              Tenés <span className="font-semibold">{visible.length} pedidos</span> esperando la transferencia.
            </>
          )}
        </p>
        <Button
          render={<Link href={single ? `/pedido/${single.publicToken}` : "/mis-pedidos"} />}
          nativeButton={false}
          className="h-10 shrink-0 rounded-full px-4 font-semibold"
        >
          {single ? "Ver alias" : "Ver pedidos"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={dismiss}
          aria-label="Cerrar aviso"
          className="size-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
