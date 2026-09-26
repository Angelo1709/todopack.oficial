"use client"

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react"

export type CartItem = {
  id: number
  name: string
  price: number
  category: string
  imageUrl?: string | null
  quantity: number
  // Opcionales: los carritos guardados antes de las presentaciones no los tienen.
  /** Unidades que incluye la presentación (1 = unidad suelta). */
  packSize?: number
  /** Etiqueta de la presentación: "Unidad", "Pack x6", "Caja x12"... */
  presentation?: string
}

type CartContextValue = {
  items: CartItem[]
  count: number
  total: number
  add: (product: Omit<CartItem, "quantity">, qty?: number) => void
  setQty: (id: number, qty: number) => void
  remove: (id: number) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = "todopack-cart-v1"

function isCartItem(value: unknown): value is CartItem {
  const item = value as CartItem
  return (
    typeof item?.id === "number" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    typeof item.quantity === "number" &&
    item.quantity > 0
  )
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const saved = raw ? JSON.parse(raw) : []
      if (Array.isArray(saved)) setItems(saved.filter(isCartItem))
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

  const add = useCallback((product: Omit<CartItem, "quantity">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id)
      if (existing) {
        // Se refrescan los datos (precio, presentación) con los del catálogo actual.
        return prev.map((i) => (i.id === product.id ? { ...i, ...product, quantity: i.quantity + qty } : i))
      }
      return [...prev, { ...product, quantity: qty }]
    })
  }, [])

  const setQty = useCallback((id: number, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)),
    )
  }, [])

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const { count, total } = useMemo(() => {
    let count = 0
    let total = 0
    for (const i of items) {
      count += i.quantity
      total += i.quantity * i.price
    }
    return { count, total }
  }, [items])

  const value = useMemo(
    () => ({ items, count, total, add, setQty, remove, clear }),
    [items, count, total, add, setQty, remove, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
