import { photoReview } from "@/lib/photo-review"
import { isPhotoId } from "@/lib/photo-review-store"
export const runtime = "nodejs"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isPhotoId(id)) return new Response(null, { status: 404 })
  const image = await photoReview.image(id, true)
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  return new Response(new Uint8Array(image.image_data), { headers: {
    "Content-Type": image.mime_type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } })
}
