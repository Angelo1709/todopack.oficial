"use client"

import Image from "next/image"
import { useState } from "react"
import { useCart } from "@/components/cart/cart-provider"
import { QuantityStepper, TierPrices, TierSummary } from "@/components/storefront/tier-pricing"
import { categoryImage } from "@/lib/categories"
import { isOptimizableImage } from "@/lib/images"
import { savingsPercent, stepUnits, type Tier } from "@/lib/pricing"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { offerLabel, visibleOffer } from "@/lib/offers"
import { Check, Plus } from "lucide-react"

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

export function ProductCard({
  article,
  className,
  priority = false,
}: {
  article: StoreArticle
  className?: string
  /** Las primeras tarjetas que se ven al abrir: su foto se pide primero, sin esperar al scroll. */
  priority?: boolean
}) {
  const { add, setQty, quantityOf } = useCart()
  const [imageReady, setImageReady] = useState(false)
  const imageSrc = article.imageUrl || categoryImage(article.category)
  const units = quantityOf(article.baseId)
  const step = stepUnits(article.tiers)
  const soldOut = !article.available
  const inCart = !soldOut && units > 0
  const bestSaving = Math.max(0, ...article.tiers.map((t) => savingsPercent(article.tiers, t)))
  // Una oferta porcentual que no supera al descuento web queda tapada: no se anuncia.
  const offers = article.tiers.flatMap((t) => visibleOffer(t.offer, t.webDiscount) ?? [])
  const offerBadges = [...new Set(offers.map(offerLabel))]
  const offerTitles = [...new Set(offers.map((o) => o.title))]
  const cartArticle = {
    id: article.baseId,
    name: article.name,
    category: article.category,
    imageUrl: article.imageUrl,
    tiers: article.tiers,
  }

  return (
    <article
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/70 transition-shadow duration-200",
        !soldOut && "hover:shadow-raised",
        inCart && "ring-2 ring-primary",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-white">
        {/* Mientras llega la foto: fondo suave animado en lugar de un recuadro en blanco. */}
        {!imageReady && <div aria-hidden="true" className="absolute inset-3 animate-pulse rounded-xl bg-muted" />}
        <Image
          src={imageSrc}
          alt={article.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
          unoptimized={!isOptimizableImage(imageSrc)}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(true)}
          className={cn(
            "object-contain p-2 transition duration-300",
            imageReady ? "opacity-100" : "opacity-0",
            soldOut ? "grayscale" : "group-hover:scale-[1.03]",
            soldOut && imageReady && "opacity-50",
          )}
        />
        {/* Insignias en una sola esquina, apiladas: nunca se pisan. */}
        {!soldOut && (offerBadges.length > 0 || bestSaving > 0) && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {offerBadges.map((label) => (
              <span
                key={label}
                className="rounded-lg bg-primary px-2 py-1 font-serif text-xs font-bold leading-none text-primary-foreground shadow-sm"
              >
                {label}
              </span>
            ))}
            {bestSaving > 0 && (
              <span className="rounded-lg bg-sidebar px-2 py-1 text-[11px] font-bold leading-none tabular-nums text-sidebar-foreground">
                Hasta -{bestSaving}%
              </span>
            )}
          </div>
        )}
        {inCart && (
          <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-white">
            <Check aria-hidden="true" className="size-4" />
            <span className="sr-only">En el carrito</span>
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-sidebar/85 py-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground backdrop-blur">
            Sin stock
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {article.category}
          </p>
          <h3
            title={article.name}
            className={cn(
              // Nombre completo (lleva medida y presentación): sin recortar. El alto mínimo es
              // exactamente 2 líneas para que los nombres cortos no desalineen la grilla.
              "mt-0.5 min-h-[2.5em] text-sm font-semibold leading-tight wrap-anywhere",
              soldOut && "text-muted-foreground",
            )}
          >
            {article.name}
          </h3>
          {offerTitles.length > 0 && (
            <p className="mt-1 line-clamp-1 text-xs font-semibold text-foreground">{offerTitles.join(" · ")}</p>
          )}
        </div>

        <TierPrices tiers={article.tiers} className={cn(soldOut && "opacity-60")} />

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {soldOut ? (
            <>
              <Button variant="outline" disabled className="h-11 w-full rounded-xl">
                Sin stock
              </Button>
              {units > 0 && (
                <button
                  type="button"
                  onClick={() => setQty(article.baseId, 0)}
                  className="min-h-11 text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Quitar del carrito
                </button>
              )}
            </>
          ) : inCart ? (
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
              onClick={() => add(cartArticle)}
              className="h-11 w-full gap-1.5 rounded-xl text-sm font-semibold active:scale-[0.98]"
              aria-label={`Agregar ${article.name} al carrito`}
            >
              <Plus aria-hidden="true" className="size-4" /> Agregar
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
