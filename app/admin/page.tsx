import { getOrdersByDate, getDeliverySummary } from "@/app/actions/admin-orders"
import { AdminDashboard } from "@/components/admin/admin-dashboard"

export const dynamic = "force-dynamic"

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr()

  const [orders, summary] = await Promise.all([
    getOrdersByDate(selectedDate),
    getDeliverySummary(selectedDate),
  ])

  return <AdminDashboard date={selectedDate} orders={orders} summary={summary} />
}
