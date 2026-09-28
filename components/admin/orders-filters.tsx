import Link from "next/link"
import { OrdersLinkPending } from "@/components/admin/orders-link-pending"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

export type FilterChip = { href: string; label: string; active: boolean; count?: number }

/** Chips de filtro (links: el estado vive en la URL). Scroll horizontal en mobile. */
export function OrdersFilterChips({ label, chips }: { label: string; chips: FilterChip[] }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      {chips.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          scroll={false}
          aria-current={c.active ? "true" : undefined}
          className={cn(
            "relative whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
            c.active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {c.label}
          {c.count !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{c.count}</span>}
          <OrdersLinkPending className="rounded-full" />
        </Link>
      ))}
    </div>
  )
}

export type ViewTab = { href: string; label: string; icon: LucideIcon; active: boolean }

/** Selector Pedidos / Carga del día / Recorrido. */
export function OrdersViewSwitch({ tabs }: { tabs: ViewTab[] }) {
  return (
    <nav
      aria-label="Vista"
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1 sm:inline-grid sm:w-fit"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          scroll={false}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "relative flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium transition-colors sm:gap-2 sm:px-4",
            t.active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <t.icon className="size-4" />
          {t.label}
          <OrdersLinkPending className="rounded-md" />
        </Link>
      ))}
    </nav>
  )
}
