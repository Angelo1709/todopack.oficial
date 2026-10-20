import { randomUUID } from "node:crypto"
import { count, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { banners } from "@/lib/db/schema"
import { BANNER_SIZES, BANNER_VARIANTS, MAX_BANNERS, normalizeBannerLink, siteOrigins } from "@/lib/banners"
import { MAX_PHOTO_BYTES, PhotoReviewError, photoMime } from "@/lib/photo-review-store"
import { requireAdmin } from "@/lib/session"

export const runtime = "nodejs"

// Alta de un banner de la portada (Admin → Promociones). Va por acá y no por una server action
// porque las imágenes pesan más que el límite de las acciones (1 MB).

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const publicUrl = process.env.BETTER_AUTH_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : request.url)
  return !!origin && origin === new URL(publicUrl).origin
}

const fail = (error: string, status = 400) => Response.json({ error }, { status })

export async function POST(request: Request) {
  let user
  try {
    user = await requireAdmin()
  } catch {
    return fail("Ingresá con una cuenta administradora.", 403)
  }
  if (!sameOrigin(request)) return fail("Subí el banner desde el panel de promociones.", 403)
  const length = Number(request.headers.get("content-length"))
  if (length > 2 * MAX_PHOTO_BYTES + 65536) return fail("Cada imagen puede pesar hasta 8 MB.", 413)

  try {
    const form = await request.formData()
    const images: Partial<Record<(typeof BANNER_VARIANTS)[number], { mime: string; data: Buffer }>> = {}
    for (const variant of BANNER_VARIANTS) {
      const file = form.get(variant)
      if (!(file instanceof File) || file.size === 0) continue
      const label = BANNER_SIZES[variant].label.toLowerCase()
      if (file.size > MAX_PHOTO_BYTES) return fail(`La imagen para ${label} pesa más de 8 MB.`)
      const data = Buffer.from(await file.arrayBuffer())
      try {
        images[variant] = { mime: photoMime(data), data }
      } catch (error) {
        if (error instanceof PhotoReviewError) return fail(`La imagen para ${label} tiene que ser JPG, PNG o WebP.`)
        throw error
      }
    }
    if (!images.celular && !images.compu) return fail("Elegí al menos una imagen (para celular o para computadora).")

    const title = String(form.get("titulo") ?? "").trim().replace(/\s+/g, " ").slice(0, 120)
    const link = normalizeBannerLink(String(form.get("link") ?? ""), siteOrigins(request.headers.get("origin")))
    if (link === null) return fail("Revisá el link: pegá la dirección de una página (por ejemplo, copiada de la tienda) o dejalo vacío.")

    const id = randomUUID()
    const saved = await db.transaction(async (tx) => {
      // Serializa las altas para respetar el máximo y el orden aunque se suban dos a la vez.
      await tx.execute(sql`select pg_advisory_xact_lock(9137302)`)
      const [{ total }] = await tx.select({ total: count() }).from(banners)
      if (total >= MAX_BANNERS) return false
      await tx.insert(banners).values({
        id,
        title,
        link,
        // Al final de la lista: los nuevos se ven después de los que ya estaban.
        position: sql`coalesce((select max(position) from banners), 0) + 1`,
        mobileMime: images.celular?.mime ?? null,
        mobileData: images.celular?.data ?? null,
        desktopMime: images.compu?.mime ?? null,
        desktopData: images.compu?.data ?? null,
        createdBy: user.id,
      })
      return true
    })
    if (!saved) return fail(`Ya hay ${MAX_BANNERS} banners. Borrá alguno que no uses para subir otro.`)

    revalidatePath("/")
    revalidatePath("/admin/promociones")
    return Response.json({ ok: true, id })
  } catch (error) {
    console.error("Banners: no se pudo guardar", error)
    return fail("No pudimos guardar el banner. Volvé a intentar.", 500)
  }
}
