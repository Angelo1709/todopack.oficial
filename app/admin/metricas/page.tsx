import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { MetricsPanel } from "@/components/admin/metrics-panel"
import { todayAR } from "@/lib/dates"
import { getSalesMetrics, metricPeriod, parseMetricRange } from "@/lib/metrics"
import { getStoreTraffic, posthogProjectUrl } from "@/lib/posthog-api"
import { isAdminRole, isSuperadmin } from "@/lib/roles"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Métricas — Panel TodoPack",
}

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (!isAdminRole(user.role)) redirect("/")

  const { dias } = await searchParams
  const period = metricPeriod(parseMetricRange(dias), todayAR())
  const [sales, traffic] = await Promise.all([
    getSalesMetrics(period),
    getStoreTraffic(period.from, period.to, period.days),
  ])

  return (
    <MetricsPanel
      period={period}
      sales={sales}
      traffic={traffic}
      posthogUrl={posthogProjectUrl()}
      showSetup={isSuperadmin(user.role)}
    />
  )
}
