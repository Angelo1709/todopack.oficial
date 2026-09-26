"use client"

import Image from "next/image"
import { useState } from "react"
import { useCart } from "@/components/cart/cart-provider"
import { formatPrice } from "@/lib/format"
import { categoryImage } from "@/lib/categories"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Check, Plus } from "lucide-react"

/** Una presentación concreta (fila de products) de un artículo. */
export type StoreVariant = {
  id: number
  name: string
  price: number
  category: string
  imageUrl: string | null
  packSize: number
  /** "Unidad", "Pack x6", "Caja x12"... */
  label: string
  unitPrice: number
  /** % de ahorro frente a la unidad del mismo artículo (0 si no hay unidad o no conviene). */
  savingsPercent: number
}

/** Un artículo del catálogo: todas sus presentaciones activas. */
export type StoreArticle = {
  key: string
  baseName: string
  category: string
  imageUrl: string | null
  variants: StoreVariant[]
}

export function ProductCard({ article }: { article: StoreArticle }) {
  const { add } = useCart()
  const [selectedId, setSelectedId] = useState(article.variants[0].id)
  const [added, setAdded] = useState(false)
  const variant = article.variants.find((v) => v.id === selectedId) ?? article.variants[0]
  const isPack = variant.packSize > 1
  const hasOptions = article.variants.length > 1

  function handleAdd() {
    add(
      {
        id: variant.id,
        name: variant.name,
        price: variant.price,
        category: variant.category,
        imageUrl: variant.imageUrl ?? article.imageUrl,
        packSize: variant.packSize,
        presentation: variant.label,
      },
      1,
    )
    setAdded(true)
    setTimeout(() => setAdded(false), 1000)
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={variant.imageUrl || article.imageUrl || categoryImage(article.category)}
          alt={article.baseName}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
          {article.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">{article.baseName}</p>

        {hasOptions ? (
          <div role="radiogroup" aria-label="Presentación" className="flex flex-col gap-1.5">
            {article.variants.map((v) => {
              const active = v.id === variant.id
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/5 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="min-w-0 truncate">{v.label}</span>
                  <span className="shrink-0 tabular-nums">{formatPrice(v.price)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          isPack && <p className="text-xs font-medium text-muted-foreground">{variant.label}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-bold tabular-nums leading-tight">{formatPrice(variant.price)}</p>
            {isPack && (
              <p className="text-xs text-muted-foreground tabular-nums">≈ {formatPrice(variant.unitPrice)} c/u</p>
            )}
            {variant.savingsPercent > 0 && (
              <span className="mt-1 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                Ahorrás {variant.savingsPercent}%
              </span>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleAdd}
            className="h-8 shrink-0 gap-1 px-2.5"
            aria-label={`Sumar ${variant.name} al carrito`}
          >
            {added ? <Check className="size-4" /> : <Plus className="size-4" />}
            {added ? "" : "Sumar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
