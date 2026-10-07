import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { isAdminRole } from "@/lib/roles"
import { RouteSettingsForm } from "@/components/admin/route-settings-form"
import { SettingsForm } from "@/components/admin/settings-form"
import { DeliverySettingsForm } from "@/components/admin/delivery-settings-form"
import { StreetMapCard } from "@/components/admin/street-map-card"
import { getSessionUser } from "@/lib/session"
import { getDeliverySettings, getRouteSettings, getSettings } from "@/lib/settings"
import { getStreetMapInfo } from "@/lib/street-map"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Configuración — Panel TodoPack",
}

export default async function AdminSettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (!isAdminRole(user.role)) redirect("/")

  const [settings, routeSettings, streetMap, deliverySettings] = await Promise.all([
    getSettings(),
    getRouteSettings(),
    getStreetMapInfo(),
    getDeliverySettings(),
  ])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-serif text-2xl font-bold">Configuración</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Horarios de entrega, cierre de pedidos, WhatsApp, datos bancarios y recorrido de reparto.
      </p>
      <DeliverySettingsForm initial={deliverySettings} />
      <div className="mt-8"><SettingsForm initial={settings} /></div>
      <div className="mt-8 flex flex-col gap-6">
        <RouteSettingsForm initial={routeSettings} />
        <StreetMapCard
          initial={
            streetMap && {
              fetchedAt: streetMap.fetchedAt.toISOString(),
              ways: streetMap.ways,
              oneWays: streetMap.oneWays,
            }
          }
        />
      </div>
    </div>
  )
}
