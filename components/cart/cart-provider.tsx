"use client"

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react"
import { refreshCartArticles } from "@/app/actions/orders"
import { normalizeTiers, priceFor, snapUnits, withoutWebDiscount, type Tier } from "@/lib/pricing"
import { EVENTS, track } from "@/lib/analytics"

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
  /** Descuento web vigente (%) y cuánto se ahorra con él en este carrito (0 = sin descuento). */
  webDiscount: number
  webSavings: number
  /** Suma unidades (se ajusta al paso del artículo: si se vende por pack x6, de a 6). */
  add: (article: CartArticle, units?: number) => void
  /** Fija las unidades de un artículo (0 lo saca). */
  setQty: (id: number, units: number) => void
  remove: (id: number) => void
  clear: () => void
  refresh: () => Promise<void>
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
  const itemsRef = useRef(items)
  itemsRef.current = items
  const refresh = useCallback(async () => {
    const ids = itemsRef.current.map((item) => item.id)
    if (!ids.length) return
    const fresh = await refreshCartArticles(ids)
    const byId = new Map(fresh.map((article) => [article.id, article]))
    setItems((prev) => prev.flatMap((item) => {
      if (!ids.includes(item.id)) return [item]
      const article = byId.get(item.id)
      return article ? [{ ...item, ...article }] : []
    }))
  }, [])
  useEffect(() => {
    if (!hydrated) return
    const update = () => { if (document.visibilityState === "visible") void refresh().catch(() => {}) }
    update()
    window.addEventListener("focus", update)
    const timer = setInterval(update, 60000)
    return () => { window.removeEventListener("focus", update); clearInterval(timer) }
  }, [hydrated, refresh])

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

  // Las métricas se calculan con el carrito actual (itemsRef), fuera de setItems: React puede ejecutar
  // dos veces la función que actualiza el estado y no queremos eventos duplicados.
  const add = useCallback((article: CartArticle, units?: number) => {
    const tiers = normalizeTiers(article.tiers)
    if (!tiers.length) return
    const before = itemsRef.current.find((i) => i.id === article.id)?.quantity ?? 0
    const quantity = snapUnits(tiers, before + (units ?? tiers[0].packSize))
    track(before > 0 ? EVENTS.cartUpdated : EVENTS.productAdded, {
      product_id: article.id,
      product_name: article.name,
      category: article.category,
      quantity,
      previous_quantity: before,
      price: tiers[0].price,
      value: priceFor(tiers, quantity)?.total ?? null,
    })
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
    const item = itemsRef.current.find((i) => i.id === id)
    if (item) {
      const quantity = snapUnits(item.tiers, units)
      if (quantity !== item.quantity) {
        track(quantity > 0 ? EVENTS.cartUpdated : EVENTS.productRemoved, {
          product_id: id,
          product_name: item.name,
          category: item.category,
          quantity,
          previous_quantity: item.quantity,
          value: quantity > 0 ? (priceFor(item.tiers, quantity)?.total ?? null) : 0,
        })
      }
    }
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.id !== id) return [i]
        const quantity = snapUnits(i.tiers, units)
        return quantity > 0 ? [{ ...i, quantity }] : []
      }),
    )
  }, [])

  const remove = useCallback((id: number) => {
    const item = itemsRef.current.find((i) => i.id === id)
    if (item) {
      track(EVENTS.productRemoved, {
        product_id: id,
        product_name: item.name,
        category: item.category,
        quantity: 0,
        previous_quantity: item.quantity,
        value: 0,
      })
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const quantityOf = useCallback((id: number) => items.find((i) => i.id === id)?.quantity ?? 0, [items])

  const total = useMemo(() => items.reduce((sum, i) => sum + lineTotal(i), 0), [items])
  const { webDiscount, webSavings } = useMemo(() => {
    const webDiscount = Math.max(0, ...items.flatMap((i) => i.tiers.map((t) => t.webDiscount ?? 0)))
    if (!webDiscount) return { webDiscount: 0, webSavings: 0 }
    const regular = items.reduce((sum, i) => sum + (priceFor(withoutWebDiscount(i.tiers), i.quantity)?.total ?? lineTotal(i)), 0)
    return { webDiscount, webSavings: Math.max(0, regular - total) }
  }, [items, total])

  const value = useMemo(
    () => ({ items, count: items.length, total, webDiscount, webSavings, add, setQty, remove, clear, refresh, quantityOf }),
    [items, total, webDiscount, webSavings, add, setQty, remove, clear, refresh, quantityOf],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
