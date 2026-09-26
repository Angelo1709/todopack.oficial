import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { isAdminRole } from "@/lib/roles"
import { getAdminOrdersForDate, getPendingTransfers } from "@/app/actions/admin-orders"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import { parseAdminFilters } from "@/lib/admin-orders-utils"
import { todayAR } from "@/lib/dates"
import { getSessionUser } from "@/lib/session"
import { getRouteConfig } from "@/lib/settings"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Pedidos — Panel TodoPack",
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // El layout no frena el render de la página: se chequea acá también (además de requireAdmin en los datos).
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (!isAdminRole(user.role)) redirect("/")

  const today = todayAR()
  const filters = parseAdminFilters(await searchParams, today)

  const [orders, pendingTransfers, routeConfig] = await Promise.all([
    getAdminOrdersForDate(filters.date),
    getPendingTransfers(),
    filters.vista === "recorrido" ? getRouteConfig() : null,
  ])

  return (
    <AdminDashboard
      filters={filters}
      today={today}
      orders={orders}
      pendingTransfers={pendingTransfers}
      routeConfig={routeConfig}
    />
  )
}
