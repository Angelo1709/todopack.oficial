"use client"

import { useState } from "react"
import Link from "next/link"
import { useCart } from "@/components/cart/cart-provider"
import { QuantityStepper, TierPrices, TierSummary } from "@/components/storefront/tier-pricing"
import { stepUnits } from "@/lib/pricing"
import { formatPrice } from "@/lib/format"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Trash2, ShoppingCart } from "lucide-react"

export function CartSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { items, total, count, setQty, remove } = useCart()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={children as React.ReactElement} />
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="size-5" /> Tu carrito
          </SheetTitle>
          <SheetDescription>
            {count > 0 ? `${count} artículo${count === 1 ? "" : "s"}` : "Todavía no agregaste productos"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <ShoppingCart className="size-10 opacity-30" />
              <p className="text-sm">Explorá el catálogo y sumá productos.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium leading-tight">{item.name}</p>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Quitar ${item.name} del carrito`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <TierPrices tiers={item.tiers} className="min-w-0" />
                    <div className="w-32 shrink-0">
                      <QuantityStepper
                        value={item.quantity}
                        step={stepUnits(item.tiers)}
                        name={item.name}
                        size="sm"
                        onChange={(n) => setQty(item.id, n)}
                      />
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">
                    <TierSummary tiers={item.tiers} units={item.quantity} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <SheetFooter className="border-t border-border">
            <div className="mb-2 flex items-center justify-between text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(total)}</span>
            </div>
            <Button
                render={<Link href="/checkout" />}
                nativeButton={false}
              size="lg"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Finalizar pedido
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
