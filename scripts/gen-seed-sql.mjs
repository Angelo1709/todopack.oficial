import { readFileSync, writeFileSync } from "node:fs"

const products = JSON.parse(readFileSync("data/products.json", "utf8"))
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'"

const CHUNK = 200
let file = 0
for (let i = 0; i < products.length; i += CHUNK) {
  const rows = products.slice(i, i + CHUNK)
  const values = rows.map((p) => `(${esc(p.name)}, ${p.price}, ${esc(p.category)})`).join(",\n")
  const sql = `INSERT INTO products (name, price, category) VALUES\n${values}\nON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category = EXCLUDED.category, updated_at = now();`
  writeFileSync(`data/seed-${file}.sql`, sql)
  file++
}
console.log("[v0] wrote", file, "sql files for", products.length, "products")
