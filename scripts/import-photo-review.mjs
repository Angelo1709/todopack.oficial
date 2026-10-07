// Importa la carpeta revisada localmente. No publica coincidencias automáticas.
// Sólo conserva confirmaciones humanas de la MISMA foto; el resto queda pendiente.
// PHOTO_REVIEW_DIR=... DATABASE_URL=... node scripts/import-photo-review.mjs
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import { resolve, join, sep } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import pg from "pg"
import { PhotoReviewStore, photoMime } from "../lib/photo-review-store.ts"

const root = resolve(process.env.PHOTO_REVIEW_DIR ?? "../fotos-carrefour")
const connectionString = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error("Falta la conexión a la base de datos.")
const pool = new pg.Pool({ connectionString })
const store = new PhotoReviewStore(pool)
const rows = JSON.parse(readFileSync(join(root, "correspondencias.json"), "utf8"))
const ledgerPath = join(root, "decisiones-revision.json")
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : { productos: {} }
// Python JSON separa elementos con ', ' y ': ': se conserva exactamente la firma local.
function signature(row) {
  const fields = [row.nombre_original, row.foto_local, row.mejor_candidato?.carrefour_id ?? null, row.mejor_candidato?.url_imagen ?? null]
  const serialized = '[' + fields.map((value) => JSON.stringify(value)).join(', ') + ']'
  return createHash('sha256').update(serialized).digest('hex')
}
try {
  const catalog = (await store.snapshot()).products
  const report = { loaded: 0, duplicates: 0, confirmed: 0, rejected: 0, missing: [], errors: [] }
  const prepared = []
  for (const row of rows) {
    if (!row.foto_local) continue
    const target = resolve(root, row.foto_local)
    if (!target.startsWith(root + sep)) throw new Error("Ruta de foto inválida.")
    const products = catalog.filter((p) => p.name === row.nombre_original && p.groupKey === row.groupKey && p.packSize === row.packSize)
    if (products.length !== 1) { report.missing.push(row.nombre_original); continue }
    try {
      const data = readFileSync(target)
      prepared.push({ row, id: randomUUID(), productId: products[0].id, data,
        mime: photoMime(data), sha: createHash("sha256").update(data).digest("hex") })
    } catch (error) { report.errors.push({ name: row.nombre_original, error: error.message }) }
  }
  // Lotes pequeños evitan cientos de transacciones por la conexión remota.
  // ON CONFLICT no cambia una candidata ni una decisión que ya existe.
  for (let offset = 0; offset < prepared.length; offset += 25) {
    const batch = prepared.slice(offset, offset + 25)
    const client = await pool.connect()
    let inserted
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock(9137301)")
      const values = []
      const groups = batch.map((item) => {
        const position = values.length
        values.push(item.id, item.productId, item.row.foto_local.slice(0, 250),
          (item.row.mejor_candidato?.nombre_carrefour ?? "").slice(0, 500),
          item.row.mejor_candidato?.url_imagen ?? null, item.mime, item.data, item.sha)
        return '(' + Array.from({ length: 8 }, (_, i) => '$' + (position + i + 1)).join(',') + ')'
      })
      inserted = await client.query(`INSERT INTO product_photo_candidates
        (id,product_id,filename,source_title,source_url,mime_type,image_data,sha256)
        VALUES ${groups.join(',')} ON CONFLICT DO NOTHING RETURNING id`, values)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally { client.release() }
    const newIds = new Set(inserted.rows.map((row) => row.id))
    report.loaded += newIds.size
    report.duplicates += batch.length - newIds.size
    for (const item of batch) {
      const decision = ledger.productos[item.row.nombre_original]
      if (newIds.has(item.id) && decision?.firma_foto === signature(item.row) && ["confirmada", "errada"].includes(decision.estado)) {
        await store.decide({ id: item.id, version: 1, status: decision.estado, userId: null })
        if (decision.estado === "confirmada") report.confirmed++
        else report.rejected++
      }
    }
    console.log(`Fotos procesadas: ${Math.min(offset + batch.length, prepared.length)}/${prepared.length}`)
  }
  const reportPath = resolve(process.env.PHOTO_IMPORT_REPORT ?? join(root, "importacion-nube.json"))
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify({ loaded: report.loaded, duplicates: report.duplicates, confirmed: report.confirmed, rejected: report.rejected, missing: report.missing.length, errors: report.errors.length, reportPath }))
  if (report.errors.length || report.missing.length) process.exitCode = 1
} finally { await pool.end() }
