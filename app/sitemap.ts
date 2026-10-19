import type { MetadataRoute } from "next"
import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { CATEGORY_ORDER } from "@/lib/categorize"
import { storefrontCondition } from "@/lib/catalog"
import { getSiteUrl } from "@/lib/site"

// Lee la base al pedirlo (en el build no hay base): el catálogo cambia todos los días.
export const dynamic = "force-dynamic"

// Mapa del sitio para Google: el inicio y cada categoría con productos a la vista
// (las mismas direcciones que marca como oficiales generateMetadata de app/page.tsx).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl() ?? "http://localhost:3000"
  const rows = await db.selectDistinct({ category: products.category }).from(products).where(storefrontCondition())
  const present = new Set(rows.map((r) => r.category))

  return [
    { url: site, changeFrequency: "daily", priority: 1 },
    ...CATEGORY_ORDER.filter((c) => present.has(c)).map((category) => ({
      url: `${site}/?category=${encodeURIComponent(category)}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ]
}
