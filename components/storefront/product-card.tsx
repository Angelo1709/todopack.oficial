"use client"

import Image from "next/image"
import { useCart } from "@/components/cart/cart-provider"
import { QuantityStepper, TierPrices, TierSummary } from "@/components/storefront/tier-pricing"
import { categoryImage } from "@/lib/categories"
import { stepUnits, type Tier } from "@/lib/pricing"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

/** Un artículo del catálogo con sus presentaciones (tramos de precio). Ver lib/catalog.ts. */
export type StoreArticle = {
  key: string
  baseId: number
  name: string
  category: string
  imageUrl: string | null
  tiers: Tier[]
  /** false = sin stock en ninguna presentación (sólo con el stock activo en la tienda). */
  available: boolean
}

export function ProductCard({ article }: { article: StoreArticle }) {
  const { add, setQty, quantityOf } = useCart()
  const units = quantityOf(article.baseId)
  const step = stepUnits(article.tiers)
  const cartArticle = {
    id: article.baseId,
    name: article.name,
    category: article.category,
    imageUrl: article.imageUrl,
    tiers: article.tiers,
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={article.imageUrl || categoryImage(article.category)}
          alt={article.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
          {article.category}
        </span>
        {!article.available && (
          <span className="absolute right-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-destructive backdrop-blur">
            Sin stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">{article.name}</p>
        <TierPrices tiers={article.tiers} />

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {!article.available && units === 0 ? (
            <Button size="sm" variant="outline" disabled className="h-8 w-full">
              Sin stock
            </Button>
          ) : units > 0 ? (
            <>
              <QuantityStepper
                value={units}
                step={step}
                name={article.name}
                onChange={(n) => setQty(article.baseId, n)}
              />
              <TierSummary tiers={article.tiers} units={units} />
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => add(cartArticle)}
              className="h-8 w-full gap-1"
              aria-label={`Sumar ${article.name} al carrito`}
            >
              <Plus className="size-4" /> Sumar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
