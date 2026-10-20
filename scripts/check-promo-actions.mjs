// Promociones (descuento web, barra de anuncio y banners) con las acciones reales sobre una base en memoria.
// Uso: node scripts/check-promo-actions.mjs — no conecta con producción.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { priceFor } from "../lib/pricing.ts"

const memory = new PGlite()
for (const file of ["0001_init.sql", "0013_stock_gestion.sql", "0015_ofertas.sql", "0016_promociones.sql"]) {
  await memory.exec(readFileSync(new URL(`../lib/db/migrations/${file}`, import.meta.url), "utf8"))
}
await memory.exec(`INSERT INTO "user"(id,name,email) VALUES('admin','Admin','admin@test');
  INSERT INTO products(id,name,price,pack_size,group_key,image_url) VALUES(1,'AGUA UNIDAD',1000,1,'agua','/a.png'),(2,'AGUA PACK X6',5400,6,'agua','/a.png')`)
const ORIGIN = "http://localhost:3000"
process.env.BETTER_AUTH_URL = ORIGIN
const state = (globalThis.__promoQA = { admin: false, db: drizzle(memory), paths: [] })
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`
const mocks = {
  "@/lib/db": stub("export const db=globalThis.__promoQA.db"),
  "@/lib/session": stub("export async function requireAdmin(){if(!globalThis.__promoQA.admin)throw Error('Forbidden');return {id:'admin'}}"),
  "next/cache": stub("export function revalidatePath(path,type){globalThis.__promoQA.paths.push(type?path+':'+type:path)}"),
  "next/headers": stub(`export async function headers(){return new Headers({origin:${JSON.stringify(ORIGIN)}})}`),
  "server-only": stub(""),
}
const root = new URL("../", import.meta.url)
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true }
    if (specifier.startsWith("@/")) return { url: new URL(specifier.slice(2) + ".ts", root).href, shortCircuit: true }
    return next(specifier, context)
  },
})
// PNG de 1×1 válido.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")
try {
  const { updatePromoSettings, updateBanner, setBannerActive, moveBanner, deleteBanner } = await import("../app/actions/promo.ts")
  const { getPromoSettings } = await import("../lib/settings.ts")
  const { loadArticles } = await import("../lib/catalog.ts")
  const { listBanners, normalizeBannerLink, getBannerImage, MAX_BANNERS } = await import("../lib/banners.ts")
  const { POST } = await import("../app/api/admin/banners/route.ts")
  const { GET } = await import("../app/api/banners/[id]/[variant]/route.ts")

  // Links: rutas propias, links copiados de la tienda (quedan como ruta), externos y basura.
  const origins = [ORIGIN, "https://todopack.up.railway.app"]
  assert.equal(normalizeBannerLink("", origins), "")
  assert.equal(normalizeBannerLink(" /?q=fernet ", origins), "/?q=fernet")
  assert.equal(normalizeBannerLink("https://todopack.up.railway.app/?category=Bebidas", origins), "/?category=Bebidas")
  assert.equal(normalizeBannerLink("instagram.com/todopack", origins), "https://instagram.com/todopack")
  assert.equal(normalizeBannerLink("//otro.com", origins), "https://otro.com/", "No se confunde con una ruta propia")
  assert.equal(normalizeBannerLink("javascript:alert(1)", origins), null)

  // Descuento web: sólo admins, valores válidos, y el catálogo lo aplica al instante.
  const promo = { webDiscountActive: true, webDiscountPercent: 15, announcementActive: true, announcementText: "" }
  assert.equal((await updatePromoSettings(promo)).ok, false, "Sin sesión de admin no guarda")
  state.admin = true
  for (const bad of [0, 51, 10.5, "x"]) assert.equal((await updatePromoSettings({ ...promo, webDiscountPercent: bad })).ok, false)
  assert.equal((await updatePromoSettings({ ...promo, announcementText: "x".repeat(121) })).ok, false)
  let [agua] = await loadArticles(["agua"])
  assert.equal(priceFor(agua.tiers, 7).total, 6400, "Sin descuento: pack + unidad a precio de lista")
  const saved = await updatePromoSettings({ ...promo, announcementText: "  Envío   gratis  " })
  assert.equal(saved.ok, true)
  assert.equal(saved.values.announcementText, "Envío gratis")
  assert.deepEqual(await getPromoSettings(), { ...promo, announcementText: "Envío gratis" })
  ;[agua] = await loadArticles(["agua"])
  assert.equal(priceFor(agua.tiers, 7).total, 4590 + 850, "15%: pack $5.400 → $4.590 y unidad $1.000 → $850")
  assert.ok(state.paths.includes("/:layout"), "Revalida toda la tienda")
  assert.equal((await updatePromoSettings({ ...promo, webDiscountActive: false })).ok, true)
  ;[agua] = await loadArticles(["agua"])
  assert.equal(priceFor(agua.tiers, 7).total, 6400, "Al apagarlo vuelve el precio de lista")
  assert.equal((await getPromoSettings()).webDiscountPercent, 15, "Apagado conserva el porcentaje")

  // Alta de banners por la ruta de subida.
  const upload = (fields, headers = { origin: ORIGIN }) => {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    return POST(new Request(`${ORIGIN}/api/admin/banners`, { method: "POST", headers, body: form }))
  }
  const png = (name = "banner.png") => new File([PNG], name, { type: "image/png" })
  state.admin = false
  assert.equal((await upload({ celular: png() })).status, 403)
  state.admin = true
  assert.equal((await upload({ celular: png() }, { origin: "https://otro.com" })).status, 403, "Sólo desde el panel")
  assert.equal((await upload({})).status, 400, "Sin imágenes")
  assert.equal((await upload({ celular: new File(["hola"], "a.png", { type: "image/png" }) })).status, 400, "No es una imagen")
  assert.equal((await upload({ celular: png(), link: "javascript:alert(1)" })).status, 400)
  const first = await (await upload({ celular: png(), titulo: "  Fernet   nuevo ", link: `${ORIGIN}/?q=fernet` })).json()
  assert.ok(first.ok)
  const second = await (await upload({ compu: png() })).json()
  let list = await listBanners()
  assert.deepEqual(list.map((b) => b.id), [first.id, second.id], "Los nuevos van al final")
  assert.equal(list[0].title, "Fernet nuevo")
  assert.equal(list[0].link, "/?q=fernet")
  assert.equal(list[0].desktopUrl, null)
  assert.equal(list[1].mobileUrl, null)
  assert.equal((await getBannerImage(first.id, "celular")).mime, "image/png")
  const image = await GET(new Request(`${ORIGIN}/x`), { params: Promise.resolve({ id: first.id, variant: "celular" }) })
  assert.equal(image.status, 200)
  assert.match(image.headers.get("cache-control"), /immutable/)
  assert.equal((await GET(new Request(`${ORIGIN}/x`), { params: Promise.resolve({ id: first.id, variant: "compu" }) })).status, 404)
  assert.equal((await GET(new Request(`${ORIGIN}/x`), { params: Promise.resolve({ id: "../etc", variant: "celular" }) })).status, 404)

  // Orden, pausa, edición y borrado.
  assert.equal((await moveBanner(second.id, -1)).ok, true)
  assert.deepEqual((await listBanners()).map((b) => b.id), [second.id, first.id])
  assert.equal((await moveBanner(second.id, -1)).ok, true, "El primero no se mueve más arriba")
  assert.deepEqual((await listBanners()).map((b) => b.id), [second.id, first.id])
  assert.equal((await setBannerActive(second.id, false)).ok, true)
  assert.deepEqual((await listBanners({ onlyActive: true })).map((b) => b.id), [first.id], "La tienda no muestra los pausados")
  assert.equal((await updateBanner(first.id, { title: "Promo", link: "https://instagram.com/todopack" })).ok, true)
  assert.equal((await updateBanner(first.id, { title: "Promo", link: "ftp://x" })).ok, false)
  assert.equal((await listBanners())[1].link, "https://instagram.com/todopack")
  assert.equal((await deleteBanner(second.id)).ok, true)
  assert.equal((await setBannerActive(second.id, true)).ok, false, "Un banner borrado ya no existe")
  state.admin = false
  assert.match(String((await deleteBanner(first.id)).error), /permisos/)
  state.admin = true

  // Máximo de banners.
  list = await listBanners()
  for (let i = list.length; i < MAX_BANNERS; i++) assert.ok((await (await upload({ celular: png() })).json()).ok)
  assert.equal((await upload({ celular: png() })).status, 400, `Hasta ${MAX_BANNERS} banners`)
  console.log("OK: links de banners, permisos, descuento web en el catálogo, barra, subida, imágenes, orden, pausa, edición, borrado y máximo")
} finally {
  hooks.deregister()
  delete globalThis.__promoQA
  await memory.close()
}
