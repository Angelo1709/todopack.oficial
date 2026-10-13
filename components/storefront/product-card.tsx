"use client"

import Image from "next/image"
import { useCart } from "@/components/cart/cart-provider"
import { QuantityStepper, TierPrices, TierSummary } from "@/components/storefront/tier-pricing"
import { categoryImage } from "@/lib/categories"
import { savingsPercent, stepUnits, type Tier } from "@/lib/pricing"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { offerLabel } from "@/lib/offers"
import { Plus } from "lucide-react"

/** Un artículo del catálogo con sus presentaciones (tramos de precio). Ver lib/catalog.ts. */
export type StoreArticle = {
  key: string
  baseId: number
  name: string
  category: string
  imageUrl: string | null
  tiers: Tier[]
  /** false = agotado: se muestra en gris y no se puede sumar. */
  available: boolean
}

export function ProductCard({ article }: { article: StoreArticle }) {
  const { add, setQty, quantityOf } = useCart()
  const units = quantityOf(article.baseId)
  const step = stepUnits(article.tiers)
  const soldOut = !article.available
  const bestSaving = Math.max(0, ...article.tiers.map((t) => savingsPercent(article.tiers, t)))
  const cartArticle = {
    id: article.baseId,
    name: article.name,
    category: article.category,
    imageUrl: article.imageUrl,
    tiers: article.tiers,
  }

  return (
    <div
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow",
        !soldOut && "hover:shadow-md",
        !soldOut && units > 0 && "border-primary ring-1 ring-primary/40",
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={article.imageUrl || categoryImage(article.category)}
          alt={article.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
          className={cn(
            "object-cover transition-transform duration-300",
            soldOut ? "opacity-50 grayscale" : "group-hover:scale-105",
          )}
        />
        {!soldOut && article.tiers.some((t) => t.offer?.active) && <span className="absolute bottom-2 left-2 rounded-lg bg-primary px-3 py-1.5 text-lg font-bold text-primary-foreground shadow-sm">{[...new Set(article.tiers.filter((t) => t.offer?.active).map((t) => offerLabel(t.offer!)))].join(" · ")}</span>}
        <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
          {article.category}
        </span>
        {!soldOut && bestSaving > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary-foreground">
            Hasta -{bestSaving}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-sidebar/85 py-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground backdrop-blur">
            Sin stock
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <p className={cn("min-h-[2.5rem] wrap-anywhere text-sm font-medium leading-snug", soldOut && "text-muted-foreground")}>
          {article.name}
        </p>
        {article.tiers.some((t) => t.offer?.active) && <p className="text-xs font-semibold text-foreground">{[...new Set(article.tiers.filter((t) => t.offer?.active).map((t) => t.offer!.title))].join(" · ")}</p>}
        <TierPrices tiers={article.tiers} className={cn(soldOut && "opacity-60")} />

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {soldOut ? (
            <>
              <Button size="sm" variant="outline" disabled className="h-8 w-full">
                Sin stock disponible
              </Button>
              {units > 0 && (
                <button
                  type="button"
                  onClick={() => setQty(article.baseId, 0)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Quitar del carrito
                </button>
              )}
            </>
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
