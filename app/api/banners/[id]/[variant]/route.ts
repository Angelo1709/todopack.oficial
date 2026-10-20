import { getBannerImage, isBannerVariant } from "@/lib/banners"
import { isPhotoId } from "@/lib/photo-review-store"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await params
  if (!isPhotoId(id) || !isBannerVariant(variant)) return new Response(null, { status: 404 })
  const image = await getBannerImage(id, variant)
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  // Las imágenes de un banner no cambian nunca (para cambiarlas se sube otro banner, con otro id).
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
