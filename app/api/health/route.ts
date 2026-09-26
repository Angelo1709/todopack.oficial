import { pool } from "@/lib/db"

export const dynamic = "force-dynamic"

// Healthcheck de Railway: responde 200 solo si la base de datos contesta.
export async function GET() {
  try {
    await pool.query("SELECT 1")
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
