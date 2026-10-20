"use client"

import { useCart } from "@/components/cart/cart-provider"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { BadgePercent } from "lucide-react"

/** "10% OFF web −$ 1.200": cuánto descuenta el descuento web en el carrito actual (nada si no hay). */
export function WebDiscountSavings({ className }: { className?: string }) {
  const { webDiscount, webSavings } = useCart()
  if (!webSavings) return null
  return (
    <p
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl bg-primary/12 px-3 py-2 text-sm font-semibold ring-1 ring-primary/25",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <BadgePercent aria-hidden="true" className="size-4 text-primary" />
        {webDiscount}% OFF por comprar en la web
      </span>
      <span className="tabular-nums">−{formatPrice(webSavings)}</span>
    </p>
  )
}
