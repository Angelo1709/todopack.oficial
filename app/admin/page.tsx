import { getOrdersByDate, getDeliverySummary } from "@/app/actions/admin-orders"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import { isIsoDate, todayAR } from "@/lib/dates"

export const dynamic = "force-dynamic"

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const selectedDate = date && isIsoDate(date) ? date : todayAR()

  const [orders, summary] = await Promise.all([
    getOrdersByDate(selectedDate),
    getDeliverySummary(selectedDate),
  ])

  return <AdminDashboard date={selectedDate} orders={orders} summary={summary} />
}
