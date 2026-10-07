import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { PhotoReviewStore, photoMime, publicPhotoUrl } from "../lib/photo-review-store.ts"

const db = new PGlite()
const pool = {
  query: async (sql, args) => { const r = await db.query(sql, args); return { ...r, rowCount: /^\s*SELECT/i.test(sql) ? r.rows.length : r.affectedRows } },
  connect: async () => ({ query: pool.query, release() {} }),
}
try {
  await db.exec(`CREATE TABLE "user" (id text PRIMARY KEY);
    CREATE TABLE products (id integer PRIMARY KEY, name text, group_key text, pack_size integer, image_url text, updated_at timestamptz DEFAULT now());
    INSERT INTO products VALUES (1,'9 DE ORO 200G','9 DE ORO 200G',1,'https://ejemplo.test/anterior.jpg',now()),
      (2,'9 DE ORO 200G PACK X6','9 DE ORO 200G',6,NULL,now());`)
  await db.exec(readFileSync(new URL("../lib/db/migrations/0009_portal_fotos.sql", import.meta.url), "utf8"))
  const store = new PhotoReviewStore(pool)
  const bytes = new Uint8Array([255,216,255,224,0,10,74,70,73,70,0,1,2,3])
  assert.equal(photoMime(bytes), "image/jpeg")
  assert.throws(() => photoMime(new TextEncoder().encode("<svg>imagen falsa</svg>")))
  const first = await store.upload({ data: bytes, filename: "foto.jpg", productId: 1, userId: null })
  assert.equal((await store.upload({ data: bytes, filename: "otra.jpg", productId: 1, userId: null })).duplicate, true)
  assert.equal(await store.image(first.id, true), null, "Una pendiente nunca es pública")
  assert.ok(await store.image(first.id, false), "Una pendiente sí se puede revisar en privado")
  assert.equal((await store.snapshot()).products[0].imageUrl, "https://ejemplo.test/anterior.jpg", "Cargar no cambia la tienda")
  await store.decide({ id: first.id, version: 1, status: "confirmada", userId: null })
  let snapshot = await store.snapshot()
  assert.equal(snapshot.products[0].imageUrl, publicPhotoUrl(first.id))
  assert.equal(snapshot.products[1].imageUrl, null, "Confirmar no publica en todas las presentaciones")
  assert.ok(await store.image(first.id, true))
  await assert.rejects(store.decide({ id: first.id, version: 1, status: "errada", userId: null }), /cambió/)
  await assert.rejects(store.decide({ id: first.id, version: 2, productId: 2, userId: null }), /pendiente/)
  const second = await store.upload({ data: new Uint8Array([...bytes, 4]), filename: "nueva.jpg", productId: 1, userId: null })
  await store.decide({ id: second.id, version: 1, status: "confirmada", userId: null })
  await store.decide({ id: first.id, version: 2, status: "errada", userId: null })
  assert.equal((await store.snapshot()).products[0].imageUrl, publicPhotoUrl(second.id), "Rechazar la vieja no retira la nueva")
  assert.equal(await store.image(first.id, true), null)
  await store.decide({ id: second.id, version: 2, status: "pendiente", userId: null })
  assert.equal((await store.snapshot()).products[0].imageUrl, null, "Deshacer retira la foto publicada")
  assert.equal(await store.image(second.id, true), null)
  const unassigned = await store.upload({ data: bytes, filename: "sin-nombre.jpg", userId: null })
  await assert.rejects(store.decide({ id: unassigned.id, version: 1, status: "confirmada", userId: null }), /Elegí el producto/)
  await assert.rejects(store.decide({ id: unassigned.id, version: 1, productId: 999, userId: null }), /no existe/)
  await store.decide({ id: unassigned.id, version: 1, productId: 2, userId: null })
  await store.decide({ id: unassigned.id, version: 2, status: "confirmada", userId: null })
  assert.equal((await store.snapshot()).products[1].imageUrl, publicPhotoUrl(unassigned.id))
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM product_photo_reviews")).rows[0].n, 6)
  console.log("OK: carga privada, confirmación pública, retiro, duplicados, asociación, historial y decisiones obsoletas.")
} finally { await db.close() }
