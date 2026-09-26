"use client"

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react"
import { normalizeTiers, priceFor, snapUnits, type Tier } from "@/lib/pricing"

/**
 * Un artículo en el carrito. `quantity` son unidades; el precio sale de sus presentaciones
 * (tramos) con lib/pricing.ts. El servidor lo recalcula al confirmar el pedido.
 */
export type CartItem = {
  /** Producto base del artículo (su presentación más chica). */
  id: number
  name: string
  category: string
  imageUrl?: string | null
  quantity: number
  tiers: Tier[]
}

export type CartArticle = Omit<CartItem, "quantity">

type CartContextValue = {
  items: CartItem[]
  /** Cantidad de artículos distintos. */
  count: number
  total: number
  /** Suma unidades (se ajusta al paso del artículo: si se vende por pack x6, de a 6). */
  add: (article: CartArticle, units?: number) => void
  /** Fija las unidades de un artículo (0 lo saca). */
  setQty: (id: number, units: number) => void
  remove: (id: number) => void
  clear: () => void
  quantityOf: (id: number) => number
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = "todopack-cart-v2"
const LEGACY_KEY = "todopack-cart-v1"

function isTier(value: unknown): value is Tier {
  const t = value as Tier
  return typeof t?.productId === "number" && typeof t.packSize === "number" && typeof t.price === "number"
}

function isCartItem(value: unknown): value is CartItem {
  const item = value as CartItem
  return (
    typeof item?.id === "number" &&
    typeof item.name === "string" &&
    typeof item.quantity === "number" &&
    item.quantity > 0 &&
    Array.isArray(item.tiers) &&
    item.tiers.length > 0 &&
    item.tiers.every(isTier)
  )
}

/** Carritos guardados antes de los precios por tramos: una presentación con su precio. */
function fromLegacy(value: unknown): CartItem | null {
  const old = value as { id?: unknown; name?: unknown; price?: unknown; quantity?: unknown; packSize?: unknown }
  if (typeof old?.id !== "number" || typeof old.name !== "string" || typeof old.price !== "number") return null
  const packSize = typeof old.packSize === "number" && old.packSize > 1 ? old.packSize : 1
  const quantity = typeof old.quantity === "number" ? old.quantity : 0
  if (quantity <= 0) return null
  const legacy = old as { category?: unknown; imageUrl?: unknown }
  return {
    id: old.id,
    name: old.name,
    category: typeof legacy.category === "string" ? legacy.category : "Otros",
    imageUrl: typeof legacy.imageUrl === "string" ? legacy.imageUrl : null,
    quantity: quantity * packSize,
    tiers: [{ productId: old.id, name: old.name, label: packSize > 1 ? `Pack x${packSize}` : "Unidad", packSize, price: old.price }],
  }
}

function loadSaved(): CartItem[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    const saved = JSON.parse(raw)
    return Array.isArray(saved) ? saved.filter(isCartItem) : []
  }
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (!legacy) return []
  localStorage.removeItem(LEGACY_KEY)
  const saved = JSON.parse(legacy)
  return Array.isArray(saved) ? saved.map(fromLegacy).filter((i): i is CartItem => i !== null) : []
}

export function lineTotal(item: CartItem): number {
  return priceFor(item.tiers, item.quantity)?.total ?? 0
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      setItems(loadSaved())
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore
    }
  }, [items, hydrated])

  const add = useCallback((article: CartArticle, units?: number) => {
    const tiers = normalizeTiers(article.tiers)
    if (!tiers.length) return
    setItems((prev) => {
      const existing = prev.find((i) => i.id === article.id)
      const quantity = snapUnits(tiers, (existing?.quantity ?? 0) + (units ?? tiers[0].packSize))
      if (existing) {
        // Se refrescan los datos (precios, presentaciones) con los del catálogo actual.
        return prev.map((i) => (i.id === article.id ? { ...i, ...article, tiers, quantity } : i))
      }
      return [...prev, { ...article, tiers, quantity }]
    })
  }, [])

  const setQty = useCallback((id: number, units: number) => {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.id !== id) return [i]
        const quantity = snapUnits(i.tiers, units)
        return quantity > 0 ? [{ ...i, quantity }] : []
      }),
    )
  }, [])

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const quantityOf = useCallback((id: number) => items.find((i) => i.id === id)?.quantity ?? 0, [items])

  const total = useMemo(() => items.reduce((sum, i) => sum + lineTotal(i), 0), [items])

  const value = useMemo(
    () => ({ items, count: items.length, total, add, setQty, remove, clear, quantityOf }),
    [items, total, add, setQty, remove, clear, quantityOf],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
