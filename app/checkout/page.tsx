import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { CheckoutForm } from "@/components/checkout/checkout-form"

export const dynamic = "force-dynamic"

export default async function CheckoutPage() {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")

  return (
    <main className="min-h-dvh bg-background">
      <SiteHeader />
      <CheckoutForm
        defaults={{
          name: user.name ?? "",
          phone: user.phone ?? "",
          address: user.address ?? "",
        }}
      />
    </main>
  )
}
