import { getSessionUser } from "@/lib/session"
import { getSettings } from "@/lib/settings"
import { todayAR } from "@/lib/dates"
import { SiteHeader } from "@/components/site-header"
import { CheckoutForm } from "@/components/checkout/checkout-form"

export const dynamic = "force-dynamic"

// Se puede comprar sin cuenta: si hay sesión, precargamos los datos del usuario.
export default async function CheckoutPage() {
  const [user, settings] = await Promise.all([getSessionUser(), getSettings()])

  return (
    <main className="min-h-dvh bg-background">
      <SiteHeader />
      <CheckoutForm
        defaults={{
          name: user?.name ?? "",
          phone: user?.phone ?? "",
          email: user?.email ?? "",
          address: user?.address ?? "",
        }}
        bank={{
          alias: settings.bankAlias.trim(),
          cbu: settings.bankCbu.trim(),
          holder: settings.bankHolder.trim(),
        }}
        whatsappNumber={settings.whatsappNumber}
        isGuest={!user}
        minDate={todayAR()}
      />
    </main>
  )
}
