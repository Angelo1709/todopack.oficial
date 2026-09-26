// Aplica en orden las migraciones de lib/db/migrations/ que todavía no corrieron.
// Uso: DATABASE_URL=... node scripts/migrate.mjs
// Corre también al arrancar (`pnpm start`), antes de `next start`.
//
// - NNNN_nombre.sql: SQL plano.
// - NNNN_nombre.mjs: migración de datos; exporta `default async (client) => {}` y puede importar lib/*.ts.
// Cada una corre en su transacción.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import pg from "pg"

const dir = join(import.meta.dirname, "..", "lib", "db", "migrations")

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL")
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

// Lock para que dos instancias arrancando a la vez no apliquen las mismas migraciones.
const LOCK_ID = 4815162342

try {
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID])
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const { rows } = await client.query("SELECT name FROM schema_migrations")
  const applied = new Set(rows.map((r) => r.name))
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") || f.endsWith(".mjs"))
    .sort()

  let count = 0
  for (const file of files) {
    if (applied.has(file)) continue
    console.log(`Aplicando ${file}...`)
    await client.query("BEGIN")
    try {
      if (file.endsWith(".mjs")) {
        const { default: migrate } = await import(pathToFileURL(join(dir, file)).href)
        await migrate(client)
      } else {
        await client.query(readFileSync(join(dir, file), "utf8"))
      }
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
  await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {})
  await client.end()
}
