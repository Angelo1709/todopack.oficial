"use client"

import { useState } from "react"
import Link from "next/link"
import { useCart } from "@/components/cart/cart-provider"
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
import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react"

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
                <li key={item.id} className="flex gap-3 rounded-lg border border-border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-tight">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatPrice(item.price)} c/u</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => setQty(item.id, item.quantity - 1)}
                          className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"
                          aria-label="Restar uno"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(item.id, item.quantity + 1)}
                          className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"
                          aria-label="Sumar uno"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(item.id)}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        aria-label="Quitar del carrito"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">
                    {formatPrice(item.price * item.quantity)}
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
