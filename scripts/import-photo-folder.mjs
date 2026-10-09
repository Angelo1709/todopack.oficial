// Carga una carpeta de fotos cuyo nombre de archivo es el del producto ("PAGINA TDP" del dueño).
// La carpeta es la fuente de verdad: una coincidencia exacta se confirma y se publica en todo el
// artículo (unidad y packs), aunque ya tuviera otra foto. Las dudosas quedan pendientes en el
// portal (/admin/fotos) vinculadas al producto más parecido; las que no se parecen a ninguno,
// pendientes sin vincular. Sin APLICAR=1 sólo muestra qué haría.
//
// PHOTO_FOLDER=~/Desktop/"PAGINA TDP" DATABASE_URL=... [APLICAR=1] node scripts/import-photo-folder.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import pg from "pg"
import { PhotoReviewStore, photoMime, publicPhotoUrl } from "../lib/photo-review-store.ts"
import { matchPhotoFile } from "../lib/photo-folder-match.ts"

const folder = resolve(process.env.PHOTO_FOLDER ?? "")
const apply = process.env.APLICAR === "1"
const connectionString = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL
if (!process.env.PHOTO_FOLDER) throw new Error("Falta PHOTO_FOLDER (la carpeta con las fotos).")
if (!connectionString) throw new Error("Falta la conexión a la base de datos.")
const SOURCE = "Carpeta del dueño"

const pool = new pg.Pool({ connectionString })
const store = new PhotoReviewStore(pool)
try {
  const { rows: products } = await pool.query(
    `SELECT id, name, group_key AS "groupKey", pack_size AS "packSize" FROM products WHERE active = true`,
  )
  const files = readdirSync(folder)
    .filter((f) => !f.startsWith(".") && /\.(jpe?g|png|webp)$/i.test(f) && statSync(join(folder, f)).isFile())
    .sort((a, b) => a.localeCompare(b, "es"))
  const report = { aplicado: apply, publicadas: [], pendientes: [], sinProducto: [], errores: [] }

  for (const file of files) {
    const match = matchPhotoFile(file, products)
    const entry = { archivo: file, producto: match.closest, articulos: match.articles, faltan: match.missing, sobran: match.extra }
    let data
    try {
      data = readFileSync(join(folder, file))
      photoMime(data)
    } catch (error) {
      report.errores.push({ ...entry, error: error.message })
      continue
    }
    if (match.kind === "exacta") report.publicadas.push(entry)
    else if (match.kind === "dudosa") report.pendientes.push(entry)
    else report.sinProducto.push(entry)
    if (!apply) continue

    try {
      const targets = match.kind === "sin-producto" ? [null] : match.productIds
      for (const productId of targets) {
        const { id } = await store.upload({ data, filename: file, productId, sourceTitle: SOURCE, userId: null })
        if (match.kind !== "exacta") continue
        // Ya publicada en ese artículo: nada que hacer. Si no, se confirma (pisa la foto anterior).
        const { rows } = await pool.query(
          `SELECT c.version, c.product_id AS "productId", EXISTS (SELECT 1 FROM products p WHERE p.image_url = $2) AS published
           FROM product_photo_candidates c WHERE c.id = $1`,
          [id, publicPhotoUrl(id)],
        )
        const row = rows[0]
        if (row.published && row.productId !== null) {
          const { rows: stale } = await pool.query(
            `SELECT 1 FROM products WHERE coalesce(group_key, 'id:' || id) =
               (SELECT coalesce(group_key, 'id:' || id) FROM products WHERE id = $1)
             AND image_url IS DISTINCT FROM $2 LIMIT 1`,
            [row.productId, publicPhotoUrl(id)],
          )
          if (stale.length === 0) continue
        }
        await store.decide({ id, version: row.version, status: "confirmada", userId: null })
      }
    } catch (error) {
      report.errores.push({ ...entry, error: error.message })
    }
  }

  const reportPath = resolve(process.env.PHOTO_IMPORT_REPORT ?? join(folder, "importacion-carpeta.json"))
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n")
  for (const p of report.pendientes) console.log(`pendiente: ${p.archivo} → ${p.producto} (faltan ${p.faltan.join(", ") || "—"}; sobran ${p.sobran.join(", ") || "—"})`)
  for (const p of report.sinProducto) console.log(`sin producto: ${p.archivo}`)
  for (const p of report.errores) console.log(`error: ${p.archivo}: ${p.error}`)
  console.log(JSON.stringify({
    aplicado: apply, fotos: files.length, publicadas: report.publicadas.length, pendientes: report.pendientes.length,
    sinProducto: report.sinProducto.length, errores: report.errores.length, reportPath,
  }))
  if (report.errores.length) process.exitCode = 1
} finally {
  await pool.end()
}
