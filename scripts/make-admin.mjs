// Da rol admin a un usuario ya registrado. Uso: DATABASE_URL=... node scripts/make-admin.mjs email@ejemplo.com
import pg from "pg"

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error("Uso: node scripts/make-admin.mjs email@ejemplo.com")
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const { rowCount } = await client.query(
  `UPDATE "user" SET role = 'admin', "updatedAt" = now() WHERE lower(email) = $1`,
  [email],
)
await client.end()

if (!rowCount) {
  console.error(`No existe un usuario con email ${email}. Registrate primero en /sign-up.`)
  process.exit(1)
}
console.log(`${email} ahora es admin.`)
