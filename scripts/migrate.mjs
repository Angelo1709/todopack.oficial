// Aplica en orden las migraciones SQL de lib/db/migrations/ que todavía no corrieron.
// Uso: DATABASE_URL=... node scripts/migrate.mjs   (en Railway corre como preDeployCommand)
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import pg from "pg"

const dir = join(import.meta.dirname, "..", "lib", "db", "migrations")

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL")
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const { rows } = await client.query("SELECT name FROM schema_migrations")
  const applied = new Set(rows.map((r) => r.name))
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  let count = 0
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(dir, file), "utf8")
    console.log(`Aplicando ${file}...`)
    await client.query("BEGIN")
    try {
      await client.query(sql)
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file])
      await client.query("COMMIT")
      count++
    } catch (err) {
      await client.query("ROLLBACK")
      throw new Error(`Falló ${file}: ${err.message}`)
    }
  }
  console.log(count ? `${count} migración(es) aplicada(s).` : "Base de datos al día.")
} finally {
  await client.end()
}
