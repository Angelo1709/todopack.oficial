import { getPromoSettings } from "@/lib/settings"
import { announcementOf } from "@/lib/promo"
import { BadgePercent } from "lucide-react"

/** Barra de anuncio arriba de las páginas de la tienda (Admin → Promociones). No queda fija al bajar. */
export async function PromoBar() {
  const text = announcementOf(await getPromoSettings())
  if (!text) return null
  return (
    <div className="bg-primary text-primary-foreground">
      <p className="mx-auto flex min-h-9 max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-sm font-bold leading-tight text-balance">
        <BadgePercent aria-hidden="true" className="size-4 shrink-0" />
        {text}
      </p>
    </div>
  )
}
