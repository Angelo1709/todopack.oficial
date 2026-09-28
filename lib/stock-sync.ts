// Sincronización con el sistema de gestión del local: lo que manda el script de la PC, cómo se valida,
// el precio final y el emparejamiento por nombre con los productos de la tienda.
// Puro (sin base ni red): lo usan la ruta /api/sistema/sincronizar y scripts/check-sync.mjs.
// Sin alias `@/` ni imports: Node lo ejecuta quitando los tipos.

/** Un artículo tal como lo lee el script de la PC (tabla Articulos + alícuota de la tabla Iva). */
export type IncomingArticle = {
  /** IdArticulo */
  id: number
  /** CodigoArticulo */
  codigo: string
  nombre: string
  /** PrecioUnitario: precio de venta sin IVA. */
  precioNeto: number
  /** Alícuota de IVA en %, ej. 21 o 10.5. */
  iva: number
  /** ExistenciaActual */
  stock: number
}

export type SyncPayload = {
  /** Nombre de la PC que manda los datos. */
  equipo: string
  articulos: IncomingArticle[]
}

export const SYNC_MAX_ARTICLES = 20_000
const MAX_TEXT = 200
const MAX_ABS_STOCK = 10_000_000
const MAX_NET_PRICE = 100_000_000

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

/**
 * Valida el cuerpo que manda el script. Rechaza todo el envío ante el primer dato inválido (con el
 * artículo que falló): es preferible no actualizar nada a actualizar a medias con datos raros.
 */
export function parseSyncPayload(body: unknown): { ok: true; payload: SyncPayload } | { ok: false; error: string } {
  if (!isObject(body)) return { ok: false, error: "El cuerpo tiene que ser un objeto JSON" }
  const equipo = typeof body.equipo === "string" ? body.equipo.trim().slice(0, MAX_TEXT) : ""
  const list = body.articulos
  if (!Array.isArray(list)) return { ok: false, error: "Falta la lista de artículos" }
  if (list.length === 0) return { ok: false, error: "La lista de artículos está vacía" }
  if (list.length > SYNC_MAX_ARTICLES) return { ok: false, error: `Demasiados artículos (máx. ${SYNC_MAX_ARTICLES})` }

  const seen = new Set<number>()
  const articulos: IncomingArticle[] = []
  for (const [i, raw] of list.entries()) {
    const where = `Artículo ${i + 1}`
    if (!isObject(raw)) return { ok: false, error: `${where}: formato inválido` }
    const id = finite(raw.id)
    if (id === null || !Number.isInteger(id) || id <= 0) return { ok: false, error: `${where}: id inválido` }
    if (seen.has(id)) return { ok: false, error: `${where}: id ${id} repetido` }
    seen.add(id)
    const nombre = typeof raw.nombre === "string" ? fixMojibake(raw.nombre).trim().replace(/\s+/g, " ") : ""
    if (!nombre) return { ok: false, error: `${where} (id ${id}): sin nombre` }
    if (nombre.length > MAX_TEXT) return { ok: false, error: `${where} (id ${id}): nombre demasiado largo` }
    const codigo = raw.codigo === undefined || raw.codigo === null ? "" : String(raw.codigo).trim().slice(0, MAX_TEXT)
    // Campos vacíos en Access: precio o stock sin cargar se toman como 0.
    const precioNeto = raw.precioNeto === null || raw.precioNeto === "" ? 0 : finite(raw.precioNeto)
    if (precioNeto === null || precioNeto < 0 || precioNeto > MAX_NET_PRICE) {
      return { ok: false, error: `${where} (id ${id}): precio inválido` }
    }
    const iva = raw.iva === null || raw.iva === "" ? 0 : finite(raw.iva)
    if (iva === null || iva < 0 || iva > 100) return { ok: false, error: `${where} (id ${id}): IVA inválido` }
    const stockRaw = raw.stock === null || raw.stock === "" ? 0 : finite(raw.stock)
    if (stockRaw === null || Math.abs(stockRaw) > MAX_ABS_STOCK) {
      return { ok: false, error: `${where} (id ${id}): stock inválido` }
    }
    articulos.push({ id, codigo, nombre, precioNeto, iva, stock: Math.round(stockRaw) })
  }
  return { ok: true, payload: { equipo, articulos } }
}

/** Precio final en pesos enteros: neto + IVA, redondeado (12.396,69 al 21% -> 15.000). */
export function finalPrice(netPrice: number, iva: number): number {
  return Math.round(netPrice * (1 + iva / 100))
}

// Caracteres de Windows-1252 entre 0x80 y 0x9F (los demás hasta 0xFF coinciden con Unicode).
const CP1252_HIGH: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89,
  "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
  "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
}

/**
 * Repara texto UTF-8 que se leyó como Windows-1252: en el sistema del local "CAÑA" quedó guardado como
 * "CAÃ‘A" (así entra una lista de Excel en UTF-8 a un programa viejo). Si al revertirlo no sale UTF-8
 * válido, devuelve el texto tal cual.
 */
export function fixMojibake(text: string): string {
  if (!/[ÃÂ]/.test(text)) return text
  const bytes: number[] = []
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code < 0x100) bytes.push(code)
    else if (ch in CP1252_HIGH) bytes.push(CP1252_HIGH[ch])
    else return text
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return text
  }
}

/** Nombre para emparejar: sin acentos (Ñ -> N), en mayúsculas y con espacios simples. */
export function normalizeName(name: string): string {
  return fixMojibake(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

type Named = { name: string }

/**
 * Pares artículo del sistema -> producto de la tienda con el mismo nombre normalizado. Sólo entre los
 * que todavía no tienen vínculo, y se descartan los nombres repetidos de cualquiera de los dos lados.
 */
export function matchByName<A extends Named & { systemId: number }, P extends Named & { id: number }>(
  unlinkedArticles: A[],
  freeProducts: P[],
): { systemId: number; productId: number }[] {
  const count = <T extends Named>(list: T[]) => {
    const map = new Map<string, T[]>()
    for (const item of list) {
      const key = normalizeName(item.name)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return map
  }
  const byArticle = count(unlinkedArticles)
  const byProduct = count(freeProducts)
  const pairs: { systemId: number; productId: number }[] = []
  for (const [key, articles] of byArticle) {
    const candidates = byProduct.get(key)
    if (articles.length === 1 && candidates?.length === 1) {
      pairs.push({ systemId: articles[0].systemId, productId: candidates[0].id })
    }
  }
  return pairs.sort((a, b) => a.systemId - b.systemId)
}

/** Sin datos del sistema (producto sin vincular) el producto se considera disponible. */
export function hasStock(stock: number | null | undefined): boolean {
  return stock === null || stock === undefined || stock > 0
}

/** Minutos sin recibir datos a partir de los que el panel avisa que la PC del local dejó de sincronizar. */
export const SYNC_STALE_MINUTES = 30
