"use client"

import { useEffect, useState } from "react"
import { formatPrice } from "@/lib/format"
import {
  averageUnitPrice,
  describeBreakdown,
  describeQuantity,
  nextTierHint,
  normalizeTiers,
  priceFor,
  savingsPercent,
  unitPriceOf,
  type Tier,
} from "@/lib/pricing"
import { effectivePrice, offerLabel, offerTerms } from "@/lib/offers"
import { cn } from "@/lib/utils"
import { Minus, Plus, TrendingDown } from "lucide-react"

/** Precio base y, si hay, los tramos mayoristas: "x6 · $ 1.000 c/u · -9%". */
export function TierPrices({ tiers, className }: { tiers: Tier[]; className?: string }) {
  const sorted = normalizeTiers(tiers).map((t) => ({ ...t, originalPrice: t.price, price: effectivePrice(t.price, t.offer) }))
  const [base, ...rest] = sorted
  if (!base) return null

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {base.offer?.active && <p className="text-xs text-muted-foreground">{base.offer.kind === "percent" && <del className="mr-1 tabular-nums">{formatPrice(base.originalPrice)}</del>}{offerTerms(base.offer, base.label)}</p>}
      {base.packSize === 1 ? (
        <p className="leading-tight">
          <span className="font-serif text-lg font-bold tabular-nums">{formatPrice(base.price)}</span>{" "}
          <span className="text-xs text-muted-foreground">c/u</span>
        </p>
      ) : (
        <div className="leading-tight">
          <p className="font-serif text-lg font-bold tabular-nums">{formatPrice(base.price)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {base.label} · ≈ {formatPrice(Math.round(unitPriceOf(base)))} c/u
          </p>
        </div>
      )}
      {rest.map((t) => {
        const pct = savingsPercent(sorted, t)
        return (
          <p
            key={t.productId}
            className="flex max-w-full items-start gap-1.5 rounded-lg bg-primary/12 px-2 py-1 text-xs font-medium leading-tight tabular-nums text-foreground ring-1 ring-primary/20"
          >
            <TrendingDown aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 wrap-anywhere">
              {t.offer?.active && <span className="block font-bold">{offerLabel(t.offer)} · {offerTerms(t.offer, t.label)}{t.offer.kind === "percent" && <del className="ml-1">{formatPrice(t.originalPrice)}</del>}</span>}
              <span className="block">{t.label}: {formatPrice(t.price)}</span>
              <span className="block">≈ {formatPrice(Math.round(unitPriceOf(t)))} c/u{pct > 0 ? ` · -${pct}%` : ""}</span>
            </span>
          </p>
        )
      })}
    </div>
  )
}

/** Stepper de unidades que respeta el paso del artículo (1, o el tamaño del pack si solo se vende por pack). */
export function QuantityStepper({
  value,
  step,
  onChange,
  name,
  size = "default",
}: {
  value: number
  step: number
  onChange: (units: number) => void
  name: string
  size?: "default" | "sm"
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  function commit() {
    const n = Math.floor(Number(draft))
    if (!Number.isFinite(n) || n === value) return setDraft(String(value))
    onChange(n)
  }

  // Botones de 44px (mínimo táctil); en el carrito, un poco más compactos.
  const button = size === "sm" ? "size-10" : "size-11"
  return (
    <div className="flex items-center overflow-hidden rounded-xl border border-border bg-background">
      <button
        type="button"
        onClick={() => onChange(value - step)}
        className={cn(
          "grid shrink-0 place-items-center text-foreground transition-colors hover:bg-muted active:bg-muted",
          button,
        )}
        aria-label={`Restar ${step === 1 ? "una unidad" : `${step} unidades`} de ${name}`}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), e.preventDefault())}
        inputMode="numeric"
        aria-label={`Unidades de ${name}`}
        className="w-10 min-w-0 flex-1 bg-transparent text-center font-serif text-base font-semibold tabular-nums outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className={cn(
          "grid shrink-0 place-items-center bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80",
          button,
        )}
        aria-label={`Sumar ${step === 1 ? "una unidad" : `${step} unidades`} de ${name}`}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}

/** Subtotal de una cantidad con su desglose ("1 pack x6 + 1 u.") y cuánto falta para el próximo tramo. */
export function TierSummary({ tiers, units, compact = false }: { tiers: Tier[]; units: number; compact?: boolean }) {
  const breakdown = priceFor(tiers, units)
  if (!breakdown) return null
  const hasOffer = tiers.some((t) => t.offer?.active)
  const hint = hasOffer ? null : nextTierHint(tiers, units)
  const regular = hasOffer ? priceFor(tiers.map((t) => ({ ...t, offer: null })), units) : null
  const mixed = breakdown.lines.length > 1 || breakdown.lines[0].tier.packSize !== normalizeTiers(tiers)[0].packSize

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-muted-foreground">{describeQuantity(tiers, units)}</span>
        <span className="font-serif text-sm font-bold tabular-nums text-foreground">{formatPrice(breakdown.total)}</span>
      </p>
      {regular && regular.total > breakdown.total && <p className="font-medium text-foreground">Ahorrás {formatPrice(regular.total - breakdown.total)} con la oferta</p>}
      {hasOffer && tiers.filter((t) => t.offer?.active).map((t) => <p key={t.productId} className="text-muted-foreground">{offerLabel(t.offer!)} · {offerTerms(t.offer!, t.label)}</p>)}
      {mixed && (
        <p className="text-muted-foreground">
          {describeBreakdown(breakdown)} · ≈ {formatPrice(averageUnitPrice(breakdown))} c/u
        </p>
      )}
      {hint && !compact && (
        <p className="font-medium text-foreground">
          Sumá {hint.missing} más y pagás {formatPrice(Math.round(unitPriceOf(hint.tier)))} c/u
        </p>
      )}
    </div>
  )
}
