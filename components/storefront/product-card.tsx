"use client"

import Image from "next/image"
import { useState } from "react"
import { useCart, type CartItem } from "@/components/cart/cart-provider"
import { formatPrice } from "@/lib/format"
import { categoryImage } from "@/lib/categories"
import { Button } from "@/components/ui/button"
import { Check, Plus } from "lucide-react"

export function ProductCard({ product }: { product: Omit<CartItem, "quantity"> }) {
  const { add } = useCart()
  const [added, setAdded] = useState(false)

  function handleAdd() {
    add(product, 1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1000)
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={product.imageUrl || categoryImage(product.category)}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
          {product.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">{product.name}</p>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-base font-bold tabular-nums">{formatPrice(product.price)}</span>
          <Button
            size="sm"
            onClick={handleAdd}
            className="h-8 gap-1 px-2.5"
            aria-label={`Agregar ${product.name} al carrito`}
          >
            {added ? <Check className="size-4" /> : <Plus className="size-4" />}
            {added ? "" : "Sumar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
