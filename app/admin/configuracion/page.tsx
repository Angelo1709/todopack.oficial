import { getSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"

export default async function AdminSettingsPage() {
  const settings = await getSettings()

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-serif text-2xl font-bold">Configuración</h1>
      <p className="text-sm text-muted-foreground">WhatsApp y datos bancarios que ve el cliente al pagar.</p>
      <pre className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
        {JSON.stringify(settings, null, 2)}
      </pre>
    </div>
  )
}
