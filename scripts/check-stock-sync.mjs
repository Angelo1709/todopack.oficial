import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { registerHooks } from "node:module"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { authorizedStockRequest, stockNameKey, validateStockSnapshot } from "../lib/stock-sync.ts"
import { DELIVERY_SETTINGS_DEFAULTS } from "../lib/delivery-schedule.ts"

const memory = new PGlite()
for (const file of ["0001_init.sql", "0013_stock_gestion.sql"]) await memory.exec(readFileSync(new URL(`../lib/db/migrations/${file}`, import.meta.url), "utf8"))
const state = globalThis.__stockChecks = { db: drizzle(memory), paths: [], fail: false, deliverySettings: DELIVERY_SETTINGS_DEFAULTS }
state.pool = {
  query: (...args) => memory.query(...args),
  async connect() { return { query: (...args) => {
    if (state.fail && args[0].startsWith("UPDATE products p SET stock_quantity")) throw Error("Fallo de prueba antes del commit")
    return memory.query(...args)
  }, release() {} } },
}
const stub = code => `data:text/javascript,${encodeURIComponent(code)}`
const mocks = {
  "@/lib/db": stub("export const db=globalThis.__stockChecks.db;export const pool=globalThis.__stockChecks.pool"),
  "next/cache": stub("export function revalidatePath(path){globalThis.__stockChecks.paths.push(path)}"),
  "server-only": stub(""),
  "@/lib/session": stub("export async function getSessionUser(){return null};export async function requireUser(){throw Error('Unauthorized')}"),
  "@/lib/settings": stub("export async function getDeliverySettings(){return globalThis.__stockChecks.deliverySettings}"),
  "@/lib/order-location": stub("export async function locateOrder(){}"),
  "next/server": stub("export function after(){}"),
}
const root = new URL("../", import.meta.url)
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true }
  if (specifier.startsWith("@/")) return { url: new URL(specifier.slice(2) + ".ts", root).href, shortCircuit: true }
  return next(specifier, context)
} })
const secret = "prueba-local-" + "x".repeat(40)
process.env.STOCK_SYNC_TOKEN = secret
process.env.STOCK_SYNC_SOURCE_ID = "gestion-principal"
const make = (items, offset = 0) => ({ version: 1, sourceId: "gestion-principal", snapshotId: randomUUID(), capturedAt: new Date(Date.now() + offset).toISOString(), rowCount: items.length, items })
const item = (articleId, name, quantity) => ({ articleId, name, quantity, code: String(articleId) })
try {
  assert.equal(stockNameKey("  Coca   Cola UNIDAD  "), "COCA COLA UNIDAD")
  assert.equal(authorizedStockRequest(`Bearer ${secret}`, secret), true)
  assert.equal(authorizedStockRequest(`Bearer ${secret}x`, secret), false)
  const snapshot = make([item(11, " COCa  COLA UNIDAD ", 5), item(12, "COCA COLA PACK X6", 0), item(13, "NEGATIVO", -2), item(14, "DUPLICADO ERP", 10), item(15, "DUPLICADO ERP", 0), item(16, "INACTIVO", 8), item(17, "BAJA", 2), item(18, "DUPLICADO WEB", 7)])
  for (const bad of [{ ...snapshot, items: [], rowCount: 0 }, { ...snapshot, rowCount: 20 }, { ...snapshot, sourceId: "otro" }, { ...snapshot, items: [item(11, "A", null)], rowCount: 1 }, { ...snapshot, items: [item(11, "A", 2), item(11, "B", 3)], rowCount: 2 }, { ...snapshot, capturedAt: new Date(Date.now() + 600_000).toISOString() }]) {
    assert.throws(() => validateStockSnapshot(bad, "gestion-principal"))
  }
  await memory.exec(`INSERT INTO products(id,name,price,pack_size,group_key,active) VALUES
    (1,'COCA COLA UNIDAD',1000,1,'coca',true),(2,'COCA COLA PACK X6',5000,6,'coca',true),
    (3,'NEGATIVO',100,1,'negativo',true),(4,'SIN VINCULO',100,1,'unknown',true),
    (5,'DUPLICADO ERP',100,1,'duplicate',true),(6,'INACTIVO',100,1,'inactive',false),
    (7,'BAJA',100,1,'deleted',true),(8,'DUPLICADO WEB',100,1,'d1',true),(9,' DUPLICADO WEB ',100,1,'d2',true)`)
  const { POST, GET } = await import("../app/api/stock/sync/route.ts")
  const { loadArticles, loadArticlesForProducts } = await import("../lib/catalog.ts")
  const send = (body, headers = {}) => POST(new Request("http://localhost/api/stock/sync", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}`, ...headers }, body: JSON.stringify(body) }))
  assert.equal((await send(snapshot, { authorization: "Bearer incorrecto" })).status, 401)
  assert.equal((await send(snapshot, { "content-length": "4000001" })).status, 413)
  assert.equal((await send({ ...snapshot, rowCount: 0 })).status, 400)
  assert.equal((await memory.query("SELECT count(*)::int n FROM gestion_stock")).rows[0].n, 0)
  let result = await send(snapshot)
  assert.equal(result.status, 200)
  assert.equal((await result.json()).matched, 5)
  const get = async id => (await memory.query("SELECT * FROM products WHERE id=$1", [id])).rows[0]
  assert.equal((await get(1)).stock_quantity, 5)
  for (const id of [4, 5, 8, 9]) assert.equal((await get(id)).stock_quantity, null, "No adivina vínculos desconocidos o ambiguos")
  assert.equal((await get(6)).active, false, "No reactiva productos manualmente desactivados")
  assert.equal((await get(1)).price, 1000)
  process.env.STOCK_SYNC_REQUIRED = "true"
  let catalog = await loadArticles(["coca", "negativo", "unknown", "duplicate", "inactive", "deleted"])
  assert.deepEqual(catalog.map(a => a.key), ["coca", "deleted"])
  assert.equal(catalog[0].tiers.length, 1, "El pack agotado no participa del precio por tramos")
  assert.equal((await loadArticlesForProducts([3, 4, 6])).size, 0, "Un carrito previo rechaza artículos agotados/desconocidos/inactivos")
  process.env.STOCK_SYNC_REQUIRED = "false"
  assert.equal((await loadArticles(["unknown"])).length, 1, "Permite revisar antes de activar el control obligatorio")
  assert.equal((await send(snapshot)).status, 200)
  const old = make([item(11, "COCA COLA UNIDAD", 99)], -60_000)
  assert.equal((await send(old)).status, 409)
  assert.equal((await get(1)).stock_quantity, 5)
  state.fail = true
  const failed = make([item(11, "COCA COLA RENOMBRADA", 0)], 1000)
  assert.equal((await send(failed)).status, 503)
  assert.equal((await get(1)).stock_quantity, 5, "Un fallo revierte también el espejo del inventario")
  assert.equal((await memory.query("SELECT quantity FROM gestion_stock WHERE article_id=11")).rows[0].quantity, 5)
  state.fail = false
  result = await send(failed)
  assert.equal(result.status, 200)
  assert.equal((await get(1)).gestion_article_id, 11, "El vínculo por ID soporta cambios de nombre")
  assert.equal((await get(7)).stock_quantity, 0, "Los artículos eliminados quedan sin stock")
  assert.equal((await get(1)).active, true)
  process.env.STOCK_SYNC_REQUIRED = "true"
  assert.equal((await loadArticlesForProducts([1, 2, 7])).size, 0)
  const { createOrder } = await import("../app/actions/orders.ts")
  const checkout = await createOrder({ items: [{ id: 1, quantity: 1 }], customerName: "Prueba", phone: "3415550000", address: "Dirección de prueba", deliveryDate: new Date(Date.now() + 172_800_000).toISOString().slice(0, 10), deliverySlot: "mediodia", paymentMethod: "efectivo" })
  assert.equal(checkout.ok, false)
  assert.deepEqual(checkout.unavailableIds, [1], "La acción real de checkout rechaza un carrito guardado antes de agotarse")
  assert.equal((await memory.query("SELECT count(*)::int n FROM orders")).rows[0].n, 0)
  const back = make([item(11, "COCA COLA RENOMBRADA", 3)], 2000)
  assert.equal((await send(back)).status, 200)
  assert.equal((await loadArticles(["coca"])).length, 1, "Vuelve a aparecer cuando reponen stock")
  assert.equal((await GET(new Request("http://localhost/api/stock/sync"))).status, 401)
  const diagnostic = await (await GET(new Request("http://localhost/api/stock/sync", { headers: { authorization: `Bearer ${secret}` } }))).json()
  assert.equal(diagnostic.ok, true)
  assert.ok(diagnostic.unmatchedProducts.some(p => p.id === 4))
  assert.ok(state.paths.includes("/"))
  console.log("OK: autenticación, límites, inventario completo, ambigüedades, ceros/negativos, carrito, idempotencia, capturas antiguas, rollback, bajas, reposición y diagnóstico protegido.")

  // Prueba opcional contra la extracción real local; no publica los datos en GitHub.
  if (process.argv[2]) {
    await memory.exec("TRUNCATE gestion_stock,stock_sync_state,products RESTART IDENTITY CASCADE")
    const products = JSON.parse(readFileSync(new URL("../data/products.json", import.meta.url), "utf8"))
    for (const p of products) await memory.query("INSERT INTO products(name,price,category,pack_size,group_key) VALUES($1,$2,$3,$4,$5)", [p.name, p.price, p.category, p.packSize, p.groupKey])
    const actual = JSON.parse(readFileSync(process.argv[2], "utf8"))
    const r = await send(actual)
    assert.equal(r.status, 200)
    console.log("Base real:", await r.json())
    const rows = (await memory.query("SELECT id,name,gestion_article_id,stock_quantity FROM products WHERE stock_quantity IS NULL ORDER BY name")).rows
    if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ sourceRows: actual.rowCount, catalogRows: products.length, unmatched: rows }, null, 2))
    console.log(`Catálogo del repositorio: ${products.length} filas; ${rows.length} requieren vínculo explícito.`)
  }
} finally { hooks.deregister(); delete globalThis.__stockChecks; await memory.close() }
