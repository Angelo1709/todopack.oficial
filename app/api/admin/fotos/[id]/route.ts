import { requireAdmin } from "@/lib/session"
import { photoReview } from "@/lib/photo-review"
import { isPhotoId } from "@/lib/photo-review-store"
export const runtime = "nodejs"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return new Response("Acceso de administrador requerido", { status: 403 }) }
  const { id } = await params
  if (!isPhotoId(id)) return new Response(null, { status: 404 })
  const image = await photoReview.image(id, false)
  if (!image) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(image.image_data), { headers: {
    "Content-Type": image.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } })
}
