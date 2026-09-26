// Busca imágenes en Wikimedia Commons para productos activos sin imagen.
// Uso: DATABASE_URL=... [IMAGE_BATCH=50] node scripts/import-product-images.mjs
// Guarda la URL encontrada; solo si hay BLOB_READ_WRITE_TOKEN copia la imagen a Vercel Blob
// (mismo criterio que lib/storage.ts).
import pg from "pg"
import { parsePresentation } from "../lib/pack.ts"

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const api = "https://commons.wikimedia.org/w/api.php"
const headers = { "User-Agent": "TODO-PACK catalog image importer/1.0" }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function searchImage(name) {
  for (const query of [name, `${name} product`, `${name} bebida`]) {
    const url = new URL(api)
    url.search = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: "5",
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "900",
      format: "json",
      origin: "*",
    })
    const response = await fetch(url, { headers })
    if (!response.ok) continue
    const data = await response.json()
    const match = Object.values(data.query?.pages ?? {}).find((page) => {
      const info = page.imageinfo?.[0]
      return info?.thumburl && info.mime?.startsWith("image/") && info.size < 10_000_000 && !/logo|icon|flag|map|screenshot/i.test(page.title)
    })
    if (match) return match.imageinfo[0].thumburl
    await sleep(250)
  }
  return null
}

async function persist(sourceUrl, product) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return sourceUrl
  const { put } = await import("@vercel/blob")
  const image = await fetch(sourceUrl, { headers })
  const contentType = image.headers.get("content-type") ?? ""
  if (!image.ok || !contentType.startsWith("image/")) throw new Error("La URL no devolvió una imagen")
  const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70)
  const blob = await put(`products/${product.id}-${slug}`, await image.arrayBuffer(), { access: "public", contentType, addRandomSuffix: true })
  return blob.url
}

const limit = Number(process.env.IMAGE_BATCH ?? 1000)
const { rows } = await pool.query(
  "SELECT id, name FROM products WHERE image_url IS NULL AND active = true ORDER BY id LIMIT $1",
  [limit],
)
const missing = []
let imported = 0
for (const product of rows) {
  try {
    // Se busca por el nombre sin la presentación ("COCA COLA 1.5L", no "... PACK X6").
    const found = await searchImage(parsePresentation(product.name).baseName)
    if (!found) {
      missing.push(product)
      continue
    }
    const imageUrl = await persist(found, product)
    await pool.query("UPDATE products SET image_url = $1, updated_at = now() WHERE id = $2 AND image_url IS NULL", [imageUrl, product.id])
    imported++
    console.log(JSON.stringify({ status: "imported", id: product.id, name: product.name, url: imageUrl }))
  } catch (error) {
    const reason = error instanceof Error ? error.message : "error"
    missing.push({ ...product, reason })
    console.log(JSON.stringify({ status: "error", id: product.id, name: product.name, reason }))
  }
  await sleep(400)
}
console.log(JSON.stringify({ summary: { scanned: rows.length, imported, missing: missing.length }, missing }, null, 2))
await pool.end()
