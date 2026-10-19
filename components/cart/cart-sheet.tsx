"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useCart } from "@/components/cart/cart-provider"
import { QuantityStepper, TierPrices, TierSummary } from "@/components/storefront/tier-pricing"
import { stepUnits } from "@/lib/pricing"
import { categoryImage } from "@/lib/categories"
import { isOptimizableImage } from "@/lib/images"
import { EVENTS, track } from "@/lib/analytics"
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
import { ArrowRight, Trash2, ShoppingCart } from "lucide-react"

export function CartSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { items, total, count, setQty, remove } = useCart()

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) track(EVENTS.cartViewed, { items_count: count, value: total })
      }}
    >
      <SheetTrigger render={children as React.ReactElement} />
      <SheetContent className="flex flex-col gap-0 bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b border-border bg-card">
          <SheetTitle className="flex items-center gap-2 font-serif text-lg">
            <ShoppingCart aria-hidden="true" className="size-5 text-primary" /> Tu carrito
          </SheetTitle>
          <SheetDescription>
            {count > 0 ? `${count} artículo${count === 1 ? "" : "s"}` : "Todavía no agregaste productos"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-muted">
                <ShoppingCart aria-hidden="true" className="size-7 text-muted-foreground" />
              </span>
              <p className="font-serif text-base font-semibold">Tu carrito está vacío</p>
              <p className="max-w-56 text-sm text-muted-foreground">Explorá el catálogo y agregá productos.</p>
              <Button variant="outline" className="mt-1 h-11 rounded-full px-5" onClick={() => setOpen(false)}>
                Seguir comprando
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-card ring-1 ring-border/70">
                  <div className="flex items-start gap-3">
                    <Image
                      src={item.imageUrl || categoryImage(item.category)}
                      alt=""
                      width={64}
                      height={64}
                      unoptimized={!isOptimizableImage(item.imageUrl || categoryImage(item.category))}
                      className="size-16 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-border"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight wrap-anywhere">{item.name}</p>
                      <TierPrices tiers={item.tiers} className="mt-1" />
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="-mr-1 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Quitar ${item.name} del carrito`}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 border-t border-border/70 pt-3">
                    <div className="w-40">
                      <QuantityStepper
                        value={item.quantity}
                        step={stepUnits(item.tiers)}
                        name={item.name}
                        size="sm"
                        onChange={(n) => setQty(item.id, n)}
                      />
                    </div>
                    <TierSummary tiers={item.tiers} units={item.quantity} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <SheetFooter className="gap-3 border-t border-border bg-card pb-safe">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-serif text-2xl font-bold tabular-nums">{formatPrice(total)}</span>
            </div>
            <Button
              render={<Link href="/checkout" />}
              nativeButton={false}
              className="h-12 w-full gap-2 rounded-xl text-base font-semibold"
              onClick={() => setOpen(false)}
            >
              Finalizar pedido <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
