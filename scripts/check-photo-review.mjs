import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { PhotoReviewStore, photoMime, publicPhotoUrl } from "../lib/photo-review-store.ts"
import { photoArticles } from "../lib/photo-articles.ts"
import migrateArticles from "../lib/db/migrations/0010_fotos_por_articulo.mjs"

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
  assert.equal(snapshot.products[1].imageUrl, publicPhotoUrl(first.id), "Unidad y pack comparten una sola foto")
  assert.equal((await store.upload({ data:bytes, filename:"pack.jpg",productId:2,userId:null })).id,first.id,"Cargar para el pack no duplica el mismo archivo")
  assert.equal(photoArticles(snapshot).length,1,"Una tarjeta por artículo en el portal")
  assert.ok(await store.image(first.id, true))
  await assert.rejects(store.decide({ id: first.id, version: 1, status: "errada", userId: null }), /cambió/)
  await assert.rejects(store.decide({ id: first.id, version: 2, productId: 2, userId: null }), /pendiente/)
  const second = await store.upload({ data: new Uint8Array([...bytes, 4]), filename: "nueva.jpg", productId: 1, userId: null })
  await store.decide({ id: second.id, version: 1, status: "confirmada", userId: null })
  await store.decide({ id: first.id, version: 2, status: "errada", userId: null })
  assert.equal((await store.snapshot()).products[0].imageUrl, publicPhotoUrl(second.id), "Rechazar la vieja no retira la nueva")
  assert.equal((await store.snapshot()).products[1].imageUrl, publicPhotoUrl(second.id), "Tampoco retira el reemplazo del pack")
  assert.equal(await store.image(first.id, true), null)
  await store.decide({ id: second.id, version: 2, status: "pendiente", userId: null })
  assert.equal((await store.snapshot()).products[0].imageUrl, null, "Deshacer retira la foto publicada")
  assert.equal((await store.snapshot()).products[1].imageUrl, null, "Deshacer también la retira del pack")
  assert.equal(await store.image(second.id, true), null)
  const unassigned = await store.upload({ data: bytes, filename: "sin-nombre.jpg", userId: null })
  await assert.rejects(store.decide({ id: unassigned.id, version: 1, status: "confirmada", userId: null }), /Elegí el producto/)
  await assert.rejects(store.decide({ id: unassigned.id, version: 1, productId: 999, userId: null }), /no existe/)
  await assert.rejects(store.decide({ id: unassigned.id, version: 1, productId: 2, userId: null }), /ya está vinculada/,"Duplicado por artículo al reasignar")
  const different = await store.upload({data:new Uint8Array([...bytes,5]),filename:"alternativa.jpg",userId:null})
  await store.decide({ id: different.id, version: 1, productId: 2, userId: null })
  await store.decide({ id: different.id, version: 2, status: "confirmada", userId: null })
  assert.equal((await store.snapshot()).products[1].imageUrl, publicPhotoUrl(different.id))
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM product_photo_reviews")).rows[0].n, 6)
  // Caso real: volumen en distinta posición; precios y tamaños no cambian.
  await db.exec(`INSERT INTO products VALUES(3,'BAGGIO 1L MULTIFRUTA X8','baggio 1l multifruta',8,NULL,now()),
    (4,'BAGGIO MULTIFRUTA 1L UNIDAD','baggio multifruta 1l',1,NULL,now()),
    (5,'7UP 1.5 LT FRIA UNIDAD','7up 1.5l fria',1,NULL,now()),
    (6,'7UP 1.5L PACK X6','7up 1.5l',6,NULL,now()),
    (7,'PEPSI 1.5L FRIA UNIDAD','pepsi 1.5l fria',1,NULL,now()),
    (8,'PEPSI 1.5L PACK X6','pepsi 1.5l',6,NULL,now());`)
  const baggio=await store.upload({data:new Uint8Array([...bytes,8]),filename:"baggio.jpg",productId:3,userId:null})
  await store.decide({id:baggio.id,version:1,status:"confirmada",userId:null})
  await migrateArticles(pool)
  snapshot=await store.snapshot()
  assert.equal(snapshot.products.find(p=>p.id===3).groupKey,snapshot.products.find(p=>p.id===4).groupKey)
  assert.equal(snapshot.products.find(p=>p.id===4).imageUrl,publicPhotoUrl(baggio.id))
  assert.equal(snapshot.products.find(p=>p.id===5).groupKey,snapshot.products.find(p=>p.id===6).groupKey,"7Up fría se unifica por pedido explícito")
  assert.notEqual(snapshot.products.find(p=>p.id===7).groupKey,snapshot.products.find(p=>p.id===8).groupKey,"Otras variantes FRIA no se pierden por normalización")
  await pool.query(`INSERT INTO product_photo_candidates(id,product_id,filename,mime_type,image_data,sha256)
    SELECT '11111111-1111-4111-8111-111111111111',4,filename,mime_type,image_data,sha256 FROM product_photo_candidates WHERE id=$1`,[baggio.id])
  const a=photoArticles(await store.snapshot()).find(a=>a.id===4)
  assert.equal(a.candidates.length,1,"Fotos iguales de unidad y pack se revisan una vez")
  assert.equal(a.candidates[0].id,baggio.id,"Se conserva la publicada sobre duplicados pendientes")
  console.log("OK: carga privada, confirmación pública, retiro, duplicados, asociación, historial y decisiones obsoletas.")
} finally { await db.close() }
