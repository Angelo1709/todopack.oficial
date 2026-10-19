import { photoReview } from "@/lib/photo-review"
import { isPhotoId } from "@/lib/photo-review-store"
export const runtime = "nodejs"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isPhotoId(id)) return new Response(null, { status: 404 })
  const image = await photoReview.image(id, true)
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  // Los bytes de una foto no cambian nunca (se insertan una vez; una foto nueva tiene otro id):
  // el navegador y el optimizador de imágenes la pueden guardar sin volver a pedirla a la base.
  return new Response(new Uint8Array(image.image_data), { headers: {
    "Content-Type": image.mime_type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  } })
}
