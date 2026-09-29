// Lectura de la lista de precios (Excel) ya convertida a filas con SheetJS:
//   utils.sheet_to_json(sheet, { header: 1, defval: null })
// Detecta las columnas de descripción y precio aunque el encabezado no esté en la primera fila.
//
// Lo usan el import del admin (navegador) y scripts/parse-products.mjs (Node ejecuta .ts):
// sin imports, sin alias "@/" ni sintaxis TS no borrable.

export type PriceRow = { name: string; price: number }

export type PriceListResult = {
  rows: PriceRow[]
  /** Filas con datos que no se pudieron leer (sin nombre o sin precio válido). */
  skipped: number
  /** Fila (base 0) del encabezado detectado, o -1 si se infirieron las columnas por el contenido. */
  headerRow: number
  nameCol: number
  priceCol: number
}

const HEADER_SCAN_ROWS = 30

function headerKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, " ")
    .trim()
}

// Algunos ERP exportan a la vez "Descripción" (el rubro: ALMACEN/BEBIDAS) y
// "Descripción Artículo" (el nombre real). No alcanza con elegir la primera
// columna que contenga "descrip": priorizamos encabezados específicos y
// descartamos identificadores como "Código Artículo" o "IdArticulo".
function nameHeaderScore(value: string): number {
  const key = headerKey(value)
  if (!key || /^(?:id|codigo|cod|sku|ean|barcode|rubro|categoria|proveedor)(?: |$)/.test(key)) return 0
  if (/^(?:descripcion|nombre|detalle) (?:del )?(?:articulo|producto)$/.test(key)) return 120
  if (/^(?:articulo|producto) (?:descripcion|nombre|detalle)$/.test(key)) return 115
  if (/^(?:descripcion|nombre|producto|detalle)$/.test(key)) return 100
  if (/^(?:articulo)$/.test(key)) return 90
  if (/\b(?:descripcion|nombre|producto|detalle|articulo)\b/.test(key)) return 60
  return 0
}

function priceHeaderScore(value: string): number {
  const key = headerKey(value)
  if (!key) return 0
  if (/^precio (?:de )?venta$/.test(key)) return 120
  if (/^(?:precio|price)$/.test(key)) return 110
  if (/\b(?:precio|price)\b/.test(key)) return 100
  if (/^(?:importe|valor)$/.test(key)) return 90
  if (/\b(?:importe|valor)\b/.test(key)) return 70
  return key === "$" ? 50 : 0
}

/** Convierte "15000", "15.000", "$ 15.000", "1.234,56" o un número de Excel a pesos enteros. */
export function parsePrice(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : NaN
  if (raw === null || raw === undefined) return NaN
  const cleaned = String(raw).replace(/[^\d.,]/g, "")
  if (!cleaned) return NaN
  let normalized = cleaned
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  } else if ((cleaned.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "")
  }
  return Math.round(Number(normalized))
}

// El nombre se guarda tal cual viene (solo trim): es la clave con la que se reconoce el producto
// en la base, y los productos ya cargados conservan los espacios dobles de la lista.
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

/** Clave para comparar nombres sin importar espacios ni mayúsculas. */
export function nameKey(name: string): string {
  return String(name ?? "").replace(/\s+/g, " ").trim().toUpperCase()
}

function findHeader(rows: unknown[][]): { headerRow: number; nameCol: number; priceCol: number } | null {
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS)
  let best: { headerRow: number; nameCol: number; priceCol: number; score: number } | null = null
  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? []
    let nameCol = -1
    let priceCol = -1
    let nameScore = 0
    let priceScore = 0
    row.forEach((cell, c) => {
      if (typeof cell !== "string") return
      const nextNameScore = nameHeaderScore(cell)
      if (nextNameScore > nameScore) {
        nameCol = c
        nameScore = nextNameScore
      }
      const nextPriceScore = priceHeaderScore(cell)
      if (nextPriceScore > priceScore) {
        priceCol = c
        priceScore = nextPriceScore
      }
    })
    if (nameCol !== -1 && priceCol !== -1 && nameCol !== priceCol) {
      const score = nameScore + priceScore
      if (!best || score > best.score) best = { headerRow: r, nameCol, priceCol, score }
    }
  }
  return best
}

/** Sin encabezado: la columna con más textos es la descripción y la con más números, el precio. */
function inferColumns(rows: unknown[][]): { nameCol: number; priceCol: number } {
  const text: number[] = []
  const numeric: number[] = []
  for (const row of rows.slice(0, 200)) {
    const cells = row ?? []
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]
      text[c] = text[c] ?? 0
      numeric[c] = numeric[c] ?? 0
      if (typeof cell === "number" && cell > 0) numeric[c]++
      else if (typeof cell === "string" && /[a-z]{3}/i.test(cell)) text[c]++
      else if (typeof cell === "string" && parsePrice(cell) > 0) numeric[c]++
    }
  }
  const best = (counts: number[], exclude: number) => {
    let bestCol = -1
    for (let c = 0; c < counts.length; c++) {
      if (c !== exclude && (bestCol === -1 || counts[c] > counts[bestCol])) bestCol = c
    }
    return bestCol
  }
  const nameCol = best(text, -1)
  const priceCol = best(numeric, nameCol)
  return { nameCol: Math.max(nameCol, 0), priceCol: priceCol === -1 ? 1 : priceCol }
}

export function extractPriceRows(sheetRows: unknown[][]): PriceListResult {
  const rows = Array.isArray(sheetRows) ? sheetRows : []
  const header = findHeader(rows)
  const { nameCol, priceCol } = header ?? inferColumns(rows)
  const start = header ? header.headerRow + 1 : 0

  const out: PriceRow[] = []
  let skipped = 0
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] ?? []
    const name = cellText(row[nameCol])
    const rawPrice = row[priceCol]
    if (!name && (rawPrice === null || rawPrice === undefined || rawPrice === "")) continue // fila vacía
    const price = parsePrice(rawPrice)
    if (!name || !Number.isFinite(price) || price <= 0) {
      skipped++
      continue
    }
    out.push({ name, price })
  }
  return { rows: out, skipped, headerRow: header ? header.headerRow : -1, nameCol, priceCol }
}
