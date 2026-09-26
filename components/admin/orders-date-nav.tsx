"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { OrdersLinkPending } from "@/components/admin/orders-link-pending"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { adminOrdersHref, isPanelDate, type AdminFilters } from "@/lib/admin-orders-utils"
import { addDays } from "@/lib/dates"
import { ChevronLeft, ChevronRight } from "lucide-react"

/** Día anterior / selector de fecha / día siguiente / Hoy. `today` viene del servidor (hora argentina). */
export function OrdersDateNav({ filters, today }: { filters: AdminFilters; today: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isToday = filters.date === today

  function pickDate(value: string) {
    if (!isPanelDate(value) || value === filters.date) return
    startTransition(() => router.push(adminOrdersHref(filters, { date: value }), { scroll: false }))
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Button
        variant="outline"
        size="icon-lg"
        className="relative"
        render={<Link href={adminOrdersHref(filters, { date: addDays(filters.date, -1) })} scroll={false} />}
        nativeButton={false}
        aria-label="Día anterior"
      >
        <ChevronLeft />
        <OrdersLinkPending className="rounded-lg" />
      </Button>
      <div className="relative min-w-0 flex-1 sm:w-44 sm:flex-none">
        <Input
          // Sin controlar: se puede tipear la fecha; se remonta al cambiar de día.
          key={filters.date}
          type="date"
          aria-label="Fecha de entrega"
          defaultValue={filters.date}
          onChange={(e) => pickDate(e.target.value)}
          className="h-9 w-full"
        />
        {pending && (
          <Spinner aria-label="Cargando" className="absolute top-1/2 right-9 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      <Button
        variant="outline"
        size="icon-lg"
        className="relative"
        render={<Link href={adminOrdersHref(filters, { date: addDays(filters.date, 1) })} scroll={false} />}
        nativeButton={false}
        aria-label="Día siguiente"
      >
        <ChevronRight />
        <OrdersLinkPending className="rounded-lg" />
      </Button>
      <Button
        variant={isToday ? "secondary" : "outline"}
        className="relative h-9 px-3"
        render={<Link href={adminOrdersHref(filters, { date: null })} scroll={false} />}
        nativeButton={false}
        aria-current={isToday ? "date" : undefined}
      >
        Hoy
        <OrdersLinkPending className="rounded-lg" />
      </Button>
    </div>
  )
}
