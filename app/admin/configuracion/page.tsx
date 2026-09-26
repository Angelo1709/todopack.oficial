import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SettingsForm } from "@/components/admin/settings-form"
import { getSessionUser } from "@/lib/session"
import { getSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Configuración — Panel TodoPack",
}

export default async function AdminSettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (user.role !== "admin") redirect("/")

  const settings = await getSettings()

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-serif text-2xl font-bold">Configuración</h1>
      <p className="mb-6 text-sm text-muted-foreground">WhatsApp y datos bancarios que ve el cliente al pagar.</p>
      <SettingsForm initial={settings} />
    </div>
  )
}
