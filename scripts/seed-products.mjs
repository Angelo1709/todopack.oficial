import { readFileSync } from "node:fs"
import pg from "pg"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const products = JSON.parse(readFileSync("data/products.json", "utf8"))
console.log("[v0] seeding", products.length, "products")

let inserted = 0
for (const p of products) {
  await pool.query(
    `INSERT INTO products (name, price, category)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category = EXCLUDED.category, updated_at = now()`,
    [p.name, p.price, p.category],
  )
  inserted++
}

console.log("[v0] done, upserted", inserted)
await pool.end()
