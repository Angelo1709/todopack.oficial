"use client"

import { useLinkStatus } from "next/link"
import { cn } from "@/lib/utils"

/**
 * Pulso sobre el link tocado mientras carga la página (el panel es dinámico y no tiene loading.tsx).
 * Va adentro de un <Link> con `relative`; no mueve el layout.
 */
export function OrdersLinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 bg-current opacity-0 transition-opacity",
        pending && "animate-pulse opacity-15",
        className,
      )}
    />
  )
}
