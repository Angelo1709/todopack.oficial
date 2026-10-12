import { pool } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { applyStockSnapshot, authorizedStockRequest, MAX_SNAPSHOT_BYTES, StockSyncError, validateStockSnapshot } from "@/lib/stock-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function response(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } })
}

function authenticate(request: Request): Response | null {
  const secret = process.env.STOCK_SYNC_TOKEN ?? ""
  if (secret.length < 32) return response({ ok: false, error: "Sincronización sin configurar" }, 503)
  if (!authorizedStockRequest(request.headers.get("authorization"), secret)) return response({ ok: false, error: "No autorizado" }, 401)
  return null
}

async function readSnapshotBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new StockSyncError("Se requiere JSON", 415)
  if (Number(request.headers.get("content-length")) > MAX_SNAPSHOT_BYTES) throw new StockSyncError("Inventario demasiado grande", 413)
  if (!request.body) throw new StockSyncError("Falta el inventario")
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_SNAPSHOT_BYTES) { await reader.cancel(); throw new StockSyncError("Inventario demasiado grande", 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) }
  catch { throw new StockSyncError("JSON inválido") }
}

export async function POST(request: Request) {
  const denied = authenticate(request)
  if (denied) return denied
  try {
    const snapshot = validateStockSnapshot(await readSnapshotBody(request), process.env.STOCK_SYNC_SOURCE_ID ?? "gestion-principal")
    const client = await pool.connect()
    let result
    try {
      await client.query("BEGIN")
      await client.query("SET LOCAL statement_timeout = '30s'")
      result = await applyStockSnapshot(client, snapshot)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally { client.release() }
    revalidatePath("/")
    revalidatePath("/admin/productos")
    return response({ ok: true, snapshotId: snapshot.snapshotId, ...result })
  } catch (error) {
    if (error instanceof StockSyncError) return response({ ok: false, error: error.message }, error.status)
    console.error("No se pudo aplicar el stock de Gestión", error instanceof Error ? error.message : "Error desconocido")
    return response({ ok: false, error: "No se pudo guardar el stock. Reintentá en la próxima ejecución." }, 503)
  }
}

/** Diagnóstico protegido con la misma clave; no expone inventario sin autenticación. */
export async function GET(request: Request) {
  const denied = authenticate(request)
  if (denied) return denied
  try {
    const [state, pending, counts] = await Promise.all([
      pool.query("SELECT * FROM stock_sync_state WHERE id=1"),
      pool.query("SELECT id,name,gestion_article_id FROM products WHERE active AND stock_quantity IS NULL ORDER BY name LIMIT 1000"),
      pool.query("SELECT count(*)::int AS active, count(*) FILTER(WHERE stock_quantity>0)::int AS available, count(*) FILTER(WHERE stock_quantity IS NULL)::int AS unknown FROM products WHERE active"),
    ])
    return response({ ok: true, required: /^(true|1)$/i.test(process.env.STOCK_SYNC_REQUIRED ?? ""), state: state.rows[0] ?? null, counts: counts.rows[0], unmatchedProducts: pending.rows })
  } catch { return response({ ok: false, error: "No se pudo leer el estado de sincronización" }, 503) }
}
