// Genera archivos SQL (seed-N.sql) con el upsert de data/products.json, para correr a mano.
// Uso: node scripts/gen-seed-sql.mjs [carpeta_destino]   (por defecto data/)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { PRODUCT_COLUMNS, PRODUCT_CONFLICT_SQL, productValues } from "./products-sql.mjs"

const outDir = process.argv[2] || "data"
const products = JSON.parse(readFileSync("data/products.json", "utf8"))

const literal = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

mkdirSync(outDir, { recursive: true })
const CHUNK = 200
let files = 0
for (let i = 0; i < products.length; i += CHUNK) {
  const values = products
    .slice(i, i + CHUNK)
    .map((p) => `(${productValues(p).map(literal).join(", ")})`)
    .join(",\n")
  writeFileSync(join(outDir, `seed-${files}.sql`), `INSERT INTO products (${PRODUCT_COLUMNS}) VALUES\n${values}\n${PRODUCT_CONFLICT_SQL};\n`)
  files++
}
console.log(`${files} archivo(s) SQL en ${outDir}/ para ${products.length} productos.`)
