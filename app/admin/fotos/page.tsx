import { requireAdmin } from "@/lib/session"
import { photoReview } from "@/lib/photo-review"
import { PhotoPortal } from "@/components/admin/photo-portal"
export const dynamic = "force-dynamic"
export default async function PhotosPage() {
  await requireAdmin()
  return <PhotoPortal initial={await photoReview.snapshot()} />
}
