import pg from "pg"
import { put } from "@vercel/blob"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const api = "https://commons.wikimedia.org/w/api.php"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function searchImage(name) {
  const queries = [name, `${name} product`, `${name} bebida`]
  for (const query of queries) {
    const url = new URL(api)
    url.search = new URLSearchParams({ action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "5", prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "900", format: "json", origin: "*" })
    const response = await fetch(url, { headers: { "User-Agent": "TODO-PACK catalog image importer/1.0" } })
    if (!response.ok) continue
    const data = await response.json()
    const pages = Object.values(data.query?.pages ?? {})
    const match = pages.find((page) => {
      const info = page.imageinfo?.[0]
      return info?.mime?.startsWith("image/") && info.size < 10_000_000 && !/logo|icon|flag|map|screenshot/i.test(page.title)
    })
    if (match?.imageinfo?.[0]?.thumburl) return { imageUrl: match.imageinfo[0].thumburl, sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(match.title.replaceAll(" ", "_"))}` }
    await sleep(250)
  }
  return null
}

async function main() {
  const limit = Number(process.env.IMAGE_BATCH ?? 1000)
  const { rows } = await pool.query("SELECT id, name FROM products WHERE image_url IS NULL AND active = true ORDER BY id LIMIT $1", [limit])
  const missing = []
  let imported = 0
  for (const product of rows) {
    try {
      const found = await searchImage(product.name)
      if (!found) { missing.push(product); continue }
      const image = await fetch(found.imageUrl, { headers: { "User-Agent": "TODO-PACK catalog image importer/1.0" } })
      const contentType = image.headers.get("content-type") ?? ""
      if (!image.ok || !contentType.startsWith("image/")) { missing.push(product); continue }
      const blob = await put(`products/${product.id}-${product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70)}.jpg`, await image.arrayBuffer(), { access: "public", contentType, addRandomSuffix: true })
      await pool.query("UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2 AND image_url IS NULL", [blob.url, product.id])
      imported++
      console.log(JSON.stringify({ status: "imported", id: product.id, name: product.name, url: blob.url }))
    } catch (error) {
      missing.push({ ...product, reason: error instanceof Error ? error.message : "error" })
      console.log(JSON.stringify({ status: "error", id: product.id, name: product.name, reason: error instanceof Error ? error.message : "error" }))
    }
    await sleep(400)
  }
  console.log(JSON.stringify({ summary: { scanned: rows.length, imported, missing: missing.length }, missing }, null, 2))
  await pool.end()
}

main().catch(async (error) => { console.error(error); await pool.end(); process.exit(1) })
