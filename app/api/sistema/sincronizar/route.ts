import { getSyncConfig } from "@/lib/settings"
import { parseSyncPayload } from "@/lib/stock-sync"
import { applySync, syncKeyMatches } from "@/lib/system-sync"

export const dynamic = "force-dynamic"

// Recibe los artículos (nombre, precio, stock) que manda el script de la PC del local
// (tools/sincronizador-pc/sincronizar.ps1). Autenticación: "Authorization: Bearer <clave>".
// Con ?prueba=1 valida todo y devuelve el resultado sin guardar nada.

const MAX_BODY_BYTES = 10_000_000

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const config = await getSyncConfig()
  if (!config.syncKeyHash) {
    return reply(403, {
      ok: false,
      error: "La sincronización no está activada: generá una clave en el panel (Sistema del local).",
    })
  }
  const auth = request.headers.get("authorization") ?? ""
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""
  if (!syncKeyMatches(key, config.syncKeyHash)) {
    return reply(401, { ok: false, error: "Clave inválida: revisá la CLAVE en config.txt de la PC del local." })
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return reply(413, { ok: false, error: "El envío es demasiado grande" })
  }
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return reply(413, { ok: false, error: "El envío es demasiado grande" })
    body = JSON.parse(text)
  } catch {
    return reply(400, { ok: false, error: "El envío no es un JSON válido" })
  }

  const parsed = parseSyncPayload(body)
  if (!parsed.ok) return reply(400, { ok: false, error: parsed.error })

  const dryRun = new URL(request.url).searchParams.get("prueba") === "1"
  try {
    const summary = await applySync(parsed.payload, { dryRun, pricesFromSystem: config.pricesFromSystem })
    return reply(200, { ok: true, ...summary })
  } catch (err) {
    console.error("[sincronizar]", err)
    return reply(500, { ok: false, error: "No se pudo guardar la sincronización. Se reintenta en la próxima." })
  }
}
