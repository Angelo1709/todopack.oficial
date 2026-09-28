import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OrdersDateNav } from "@/components/admin/orders-date-nav"
import { OrdersFilterChips, OrdersViewSwitch } from "@/components/admin/orders-filters"
import { OrdersList } from "@/components/admin/orders-list"
import { OrdersLoadingSheet } from "@/components/admin/orders-loading-sheet"
import { OrdersPendingTransfers } from "@/components/admin/orders-pending-transfers"
import { OrdersRoute } from "@/components/admin/orders-route"
import {
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  adminOrdersHref,
  consolidateLoad,
  countBySlot,
  longDateAR,
  matchesStatusFilter,
  relativeDayLabel,
  summarizeOrders,
  type AdminFilters,
  type AdminOrder,
  type PendingTransfer,
  type SlotFilter,
} from "@/lib/admin-orders-utils"
import { buildDeliveryRoute } from "@/lib/delivery-route"
import { formatPrice } from "@/lib/format"
import { DELIVERY_SLOTS, DELIVERY_SLOT_LABEL } from "@/lib/order-status"
import type { RouteConfig } from "@/lib/route"
import {
  Banknote,
  CalendarDays,
  ClipboardList,
  Clock,
  DollarSign,
  Landmark,
  Package,
  Route as RouteIcon,
  Truck,
} from "lucide-react"

const SLOT_FILTERS: SlotFilter[] = ["todas", ...DELIVERY_SLOTS]

export function AdminDashboard({
  filters,
  today,
  orders,
  pendingTransfers,
  routeConfig,
}: {
  filters: AdminFilters
  today: string
  /** Todos los pedidos de la fecha elegida (cualquier franja y estado). */
  orders: AdminOrder[]
  pendingTransfers: PendingTransfer[]
  /** Salida y llegada del recorrido (sólo hace falta en la vista "recorrido"). */
  routeConfig: RouteConfig | null
}) {
  const scoped = filters.slot === "todas" ? orders : orders.filter((o) => o.deliverySlot === filters.slot)
  const visible = scoped.filter((o) => matchesStatusFilter(filters.estado, o.paymentMethod, o.status))
  const summary = summarizeOrders(scoped)
  const slotCounts = countBySlot(orders)
  const slots = filters.slot === "todas" ? [...DELIVERY_SLOTS] : [filters.slot]
  const dateLabel = longDateAR(filters.date)
  const relative = relativeDayLabel(filters.date, today)
  const slotLabel = filters.slot === "todas" ? "Mediodía y noche" : DELIVERY_SLOT_LABEL[filters.slot]

  const stats = [
    { label: "Pedidos", value: String(summary.orders), icon: Package },
    { label: "Facturación", value: formatPrice(summary.revenue), icon: DollarSign },
    {
      label: "Efectivo a cobrar",
      value: formatPrice(summary.cashPending),
      icon: Banknote,
      hint: `${summary.cashPendingOrders} ${summary.cashPendingOrders === 1 ? "pedido" : "pedidos"}`,
    },
    { label: "Transferencias por validar", value: String(summary.transfersPending), icon: Landmark },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">
      <div className="flex flex-col gap-6 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-bold">Panel de pedidos</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <CalendarDays className="size-4 text-muted-foreground" />
              <span className="inline-block font-semibold first-letter:uppercase">{dateLabel}</span>
              {relative && <Badge variant="secondary">{relative}</Badge>}
            </p>
          </div>
          <OrdersDateNav filters={filters} today={today} />
        </div>

        <OrdersPendingTransfers transfers={pendingTransfers} today={today} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <s.icon className="size-4 shrink-0" />
                <span className="text-xs leading-tight">{s.label}</span>
              </div>
              <p className="mt-2 text-xl font-bold tabular-nums">{s.value}</p>
              {s.hint && <p className="text-xs text-muted-foreground tabular-nums">{s.hint}</p>}
            </div>
          ))}
          <div className="col-span-2 rounded-xl border border-border bg-card p-4 lg:col-span-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="size-4 shrink-0" />
              <span className="text-xs leading-tight">Por franja (todo el día)</span>
            </div>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {DELIVERY_SLOTS.map((slot) => (
                <span key={slot} className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tabular-nums">{slotCounts[slot]}</span>
                  <span className="text-xs text-muted-foreground">{DELIVERY_SLOT_LABEL[slot]}</span>
                </span>
              ))}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <OrdersViewSwitch
            tabs={[
              {
                href: adminOrdersHref(filters, { vista: "pedidos" }),
                label: `Pedidos (${visible.length})`,
                icon: ClipboardList,
                active: filters.vista === "pedidos",
              },
              {
                href: adminOrdersHref(filters, { vista: "carga" }),
                label: "Carga del día",
                icon: Truck,
                active: filters.vista === "carga",
              },
              {
                href: adminOrdersHref(filters, { vista: "recorrido" }),
                label: "Recorrido",
                icon: RouteIcon,
                active: filters.vista === "recorrido",
              },
            ]}
          />
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
            <OrdersFilterChips
              label="Franja"
              chips={SLOT_FILTERS.map((slot) => ({
                href: adminOrdersHref(filters, { slot }),
                label: slot === "todas" ? "Todas" : DELIVERY_SLOT_LABEL[slot],
                active: filters.slot === slot,
              }))}
            />
            {filters.vista === "pedidos" && (
              <OrdersFilterChips
                label="Estado"
                chips={STATUS_FILTERS.map((estado) => ({
                  href: adminOrdersHref(filters, { estado }),
                  label: STATUS_FILTER_LABEL[estado],
                  active: filters.estado === estado,
                  count: scoped.filter((o) => matchesStatusFilter(estado, o.paymentMethod, o.status)).length,
                }))}
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 print:mt-0">
        {filters.vista === "carga" ? (
          <OrdersLoadingSheet
            lines={consolidateLoad(scoped)}
            dateLabel={dateLabel}
            slotLabel={slotLabel}
            ordersCount={summary.orders}
          />
        ) : filters.vista === "recorrido" && routeConfig ? (
          <OrdersRoute
            routes={slots.map((slot) => buildDeliveryRoute(orders, slot, routeConfig))}
            date={filters.date}
            dateLabel={dateLabel}
            slotLabel={slotLabel}
          />
        ) : visible.length > 0 ? (
          <OrdersList orders={visible} slots={slots} estado={filters.estado} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-16 text-center text-muted-foreground">
            <ClipboardList className="size-10 opacity-30" />
            {orders.length === 0 ? (
              <>
                <p>No hay pedidos para {relative ? relative.toLowerCase() : "esta fecha"}.</p>
                {filters.date !== today && (
                  <Button
                    variant="outline"
                    className="mt-2"
                    render={<Link href={adminOrdersHref(filters, { date: null })} scroll={false} />}
                    nativeButton={false}
                  >
                    Ver los de hoy
                  </Button>
                )}
              </>
            ) : (
              <>
                <p>No hay pedidos con estos filtros.</p>
                <Button
                  variant="outline"
                  className="mt-2"
                  render={<Link href={adminOrdersHref(filters, { slot: "todas", estado: "todos" })} scroll={false} />}
                  nativeButton={false}
                >
                  Ver todos los del día
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
