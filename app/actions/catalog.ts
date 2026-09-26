"use server"

import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import { categorize } from "@/lib/categorize"
import { persistImage } from "@/lib/storage"
import { and, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type ImportRow = { name: string; price: number }

export async function importProducts(rows: ImportRow[]) {
  await requireAdmin()
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const r of rows) {
    const name = String(r.name || "").trim()
    const price = Math.round(Number(r.price))
    if (!name || !Number.isFinite(price) || price <= 0) {
      skipped++
      continue
    }
    const category = categorize(name)
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.name, name))
      .limit(1)

    if (existing.length) {
      await db
        .update(products)
        .set({ price, category, active: true, updatedAt: new Date() })
        .where(eq(products.id, existing[0].id))
      updated++
    } else {
      await db.insert(products).values({ name, price, category })
      inserted++
    }
  }

  revalidatePath("/")
  revalidatePath("/admin")
  return { inserted, updated, skipped, total: rows.length }
}

export async function setProductActive(id: number, active: boolean) {
  await requireAdmin()
  await db.update(products).set({ active, updatedAt: new Date() }).where(eq(products.id, id))
  revalidatePath("/")
  revalidatePath("/admin")
}

const imageHeaders = { "User-Agent": "TodoPack product catalog importer/1.0 (admin tool)" }

async function findProductImage(name: string) {
  const offUrl = new URL("https://world.openfoodfacts.org/cgi/search.pl")
  offUrl.search = new URLSearchParams({
    action: "process",
    json: "1",
    page_size: "5",
    search_terms: name,
    fields: "product_name,image_front_url,image_url",
  }).toString()
  const offResponse = await fetch(offUrl, { headers: imageHeaders, cache: "no-store" })
  if (offResponse.ok) {
    const data = await offResponse.json()
    const match = data.products?.find((product: { image_front_url?: string; image_url?: string }) =>
      Boolean(product.image_front_url || product.image_url),
    )
    if (match) return match.image_front_url || match.image_url
  }

  const commonsUrl = new URL("https://commons.wikimedia.org/w/api.php")
  commonsUrl.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${name} product`,
    gsrnamespace: "6",
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "900",
    format: "json",
    origin: "*",
  }).toString()
  const commonsResponse = await fetch(commonsUrl, { headers: imageHeaders, cache: "no-store" })
  if (!commonsResponse.ok) return null
  const data = await commonsResponse.json()
  const pages = Object.values(data.query?.pages ?? {}) as Array<{
    title: string
    imageinfo?: Array<{ thumburl?: string; mime?: string; size?: number }>
  }>
  const match = pages.find((page) => {
    const info = page.imageinfo?.[0]
    return Boolean(
      info?.thumburl &&
        info.mime?.startsWith("image/") &&
        (info.size ?? 0) < 10_000_000 &&
        !/logo|icon|flag|map|screenshot/i.test(page.title),
    )
  })
  return match?.imageinfo?.[0]?.thumburl ?? null
}

export async function importMissingProductImages(batchSize = 20) {
  await requireAdmin()
  const safeBatchSize = Math.min(Math.max(Math.floor(batchSize), 1), 30)
  const missing = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.active, true), sql`${products.imageUrl} IS NULL`))
    .orderBy(products.id)
    .limit(safeBatchSize)

  const imported: Array<{ id: number; name: string }> = []
  const notFound: Array<{ id: number; name: string }> = []

  for (const product of missing) {
    try {
      const sourceUrl = await findProductImage(product.name)
      if (!sourceUrl) {
        notFound.push(product)
        continue
      }
      const imageUrl = await persistImage(sourceUrl, `${product.id}-${product.name}`)
      await db
        .update(products)
        .set({ imageUrl, updatedAt: new Date() })
        .where(and(eq(products.id, product.id), sql`${products.imageUrl} IS NULL`))
      imported.push(product)
    } catch {
      notFound.push(product)
    }
  }

  revalidatePath("/")
  revalidatePath("/admin")
  return { scanned: missing.length, imported, notFound, remaining: missing.length === safeBatchSize }
}
