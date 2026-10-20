import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { BannersManager } from "@/components/admin/banners-manager"
import { PromoSettingsForm } from "@/components/admin/promo-settings-form"
import { listBanners, MAX_BANNERS } from "@/lib/banners"
import { isAdminRole } from "@/lib/roles"
import { getSessionUser } from "@/lib/session"
import { getPromoSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Promociones — Panel TodoPack",
}

export default async function AdminPromotionsPage() {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (!isAdminRole(user.role)) redirect("/")

  const [promo, banners] = await Promise.all([getPromoSettings(), listBanners()])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-serif text-2xl font-bold">Promociones</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Descuento en toda la tienda, barra de anuncio y banners de la portada. Las ofertas de productos puntuales siguen
        en Productos → Gestionar ofertas.
      </p>
      <PromoSettingsForm initial={promo} />
      <div className="mt-8">
        <BannersManager banners={banners} max={MAX_BANNERS} />
      </div>
    </div>
  )
}
