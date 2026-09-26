// Carga data/products.json en la tabla products (upsert por nombre, en lotes).
// Uso: pnpm db:seed   (o DATABASE_URL=... node scripts/seed-products.mjs)
import { readFileSync } from "node:fs"
import pg from "pg"
import { PRODUCT_COLUMNS, PRODUCT_CONFLICT_SQL, productValues } from "./products-sql.mjs"

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL")
  process.exit(1)
}

const products = JSON.parse(readFileSync("data/products.json", "utf8"))
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const BATCH = 200
const COLS = 5
let inserted = 0
let updated = 0
try {
  await client.query("BEGIN")
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)
    const placeholders = batch
      .map((_, r) => `(${Array.from({ length: COLS }, (_, c) => `$${r * COLS + c + 1}`).join(", ")})`)
      .join(", ")
    const { rows } = await client.query(
      `INSERT INTO products (${PRODUCT_COLUMNS}) VALUES ${placeholders}
       ${PRODUCT_CONFLICT_SQL}
       RETURNING (xmax = 0) AS inserted`,
      batch.flatMap(productValues),
    )
    for (const r of rows) r.inserted ? inserted++ : updated++
  }
  await client.query("COMMIT")
} catch (err) {
  await client.query("ROLLBACK")
  throw err
} finally {
  await client.end()
}

const unchanged = products.length - inserted - updated
console.log(`${products.length} productos: ${inserted} nuevos, ${updated} actualizados, ${unchanged} sin cambios.`)
