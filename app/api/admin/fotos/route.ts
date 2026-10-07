import { photoReview } from "@/lib/photo-review"
import { MAX_PHOTO_BYTES, PhotoReviewError, isPhotoId } from "@/lib/photo-review-store"
import { requireAdmin } from "@/lib/session"
import { revalidatePath } from "next/cache"

export const runtime = "nodejs"

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const publicUrl = process.env.BETTER_AUTH_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : request.url)
  return !!origin && origin === new URL(publicUrl).origin
}
function errorResponse(error: unknown) {
  if (error instanceof PhotoReviewError) return Response.json({ error: error.message }, { status: 400 })
  if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message))
    return Response.json({ error: "Ingresá con una cuenta administradora." }, { status: 403 })
  console.error("Portal de fotos: no se pudo completar la operación", error)
  return Response.json({ error: "No pudimos guardar. Volvé a intentar." }, { status: 500 })
}
export async function GET() {
  try {
    await requireAdmin()
    return Response.json(await photoReview.snapshot(), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}
export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    if (!sameOrigin(request)) return Response.json({ error: "Guardá desde el portal de fotos." }, { status: 403 })
    const length = Number(request.headers.get("content-length"))
    if (length > MAX_PHOTO_BYTES + 65536) return Response.json({ error: "La foto debe pesar hasta 8 MB." }, { status: 413 })
    const form = await request.formData()
    const file = form.get("foto")
    if (!(file instanceof File) || file.size > MAX_PHOTO_BYTES) throw new PhotoReviewError("Elegí una foto de hasta 8 MB.")
    const productValue = form.get("producto")
    const result = await photoReview.upload({
      data: new Uint8Array(await file.arrayBuffer()), filename: file.name,
      productId: productValue ? Number(productValue) : null, userId: user.id,
    })
    return Response.json(result)
  } catch (error) { return errorResponse(error) }
}
export async function PATCH(request: Request) {
  try {
    const user = await requireAdmin()
    if (!sameOrigin(request)) return Response.json({ error: "Guardá desde el portal de fotos." }, { status: 403 })
    const input = await request.json()
    if (!input || !isPhotoId(input.id)) throw new PhotoReviewError("Foto inválida.")
    if (input.status === undefined && input.productId === undefined) throw new PhotoReviewError("Elegí una decisión.")
    await photoReview.decide({ id: input.id, version: input.version, status: input.status, productId: input.productId, userId: user.id })
    revalidatePath("/")
    revalidatePath("/admin/productos")
    revalidatePath("/admin/fotos")
    return Response.json(await photoReview.snapshot(), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}
