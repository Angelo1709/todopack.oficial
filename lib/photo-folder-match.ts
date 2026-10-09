// Cruce de una carpeta de fotos con el catálogo por el nombre del archivo
// ("COCA COLA RETORNABLE VIDRIO 1.25L.jpg" -> artículo "COCA COLA RETORN 1.25L").
// Puro: lo importan scripts/import-photo-folder.mjs y scripts/check-photo-folder.mjs
// (sin alias "@/" ni sintaxis TS no borrable).
import { normalizeGroupKey } from "./pack.ts"

export type FolderProduct = { id: number; name: string; groupKey: string | null; packSize: number; active?: boolean }
export type FolderMatch = {
  /** "exacta": publicar en esos artículos · "dudosa": pendiente en el más parecido · "sin-producto": sin vincular. */
  kind: "exacta" | "dudosa" | "sin-producto"
  /** Artículos (groupKey o "id:N") a los que va la foto; con "exacta" pueden ser varios (FRÍA y no fría). */
  articles: string[]
  /** Presentación más chica de cada artículo, para vincular la foto. */
  productIds: number[]
  /** Nombre del producto más parecido y en qué difiere. */
  closest: string | null
  missing: string[]
  extra: string[]
}

// Palabras que no cambian el producto: el nombre del archivo y el de la lista las ponen o no.
const FILLER = new Set([
  "de", "con", "y", "el", "la", "los", "las", "x", "vino", "cerveza", "galletita", "galletitas", "fria",
  "unidad", "unidades", "u", "un", "unid", "descartable", "vidrio", "cops", "gin", "pack", "caja", "display",
  "jugo", "champagne", "estuche", "surtido", "surtidos", "surtida", "surtidas", "botella", "lata", "aero",
  "cajon", "tinto", "750",
])
// Palabras de relleno que se contradicen: si una aparece en un nombre y la otra en el otro, no es el mismo.
const EXCLUSIVE = [
  ["retornable", "descartable"],
  ["lata", "botella"],
]

/** Artículo al que pertenece una presentación (mismo criterio que el portal). */
export const folderArticleKey = (p: FolderProduct) => p.groupKey ?? `id:${p.id}`

/** Palabras de un nombre ya normalizado; "1.5l" pasa a "1500ml" y "1kg" a "1000g". */
export function nameWords(name: string): string[] {
  const raw = name
    .replace(/[´'`’]/g, "")
    .replace(/(^|[^\p{L}\d])3\/4(?![\d])/gu, "$1 750ML ")
    .replace(/(^|[^\p{L}\d])C\//giu, "$1CON ")
    .replace(/(^|[^\p{L}\d])S\//giu, "$1SIN ")
    // "PACK X 6", "X18U", "X 20 UNIDADES": cantidad de la presentación, no del producto.
    // "X 400 G" sí es el peso: se deja.
    .replace(/(^|[^\p{L}\d])X ?\d+(?! ?(?:ML|CC|L|LT|LTS|G|GR|GRS|KG|K)(?![\p{L}\d]))(?:[.,]\d+)? ?(?:U|UN|UNID|UNIDADES)?(?![\p{L}\d.,])/giu, "$1 ")
  const s = normalizeGroupKey(raw).replace(/[/+()]/g, " ")
  // normalizeGroupKey quita "750ml" (botella estándar); acá se conserva para no confundirla con la de 1 L.
  const standard = /(^|[^\p{L}\d.,])750 ?(?:ML|CC)(?![\p{L}\d])/iu.test(raw) ? " 750ml" : ""
  return (s + standard)
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      const m = /^(\d+(?:\.\d+)?)(ml|l|g|kg)$/.exec(w)
      if (!m) return w
      const n = Math.round(Number(m[1]) * (m[2] === "l" || m[2] === "kg" ? 1000 : 1))
      return `${n}${m[2] === "ml" || m[2] === "l" ? "ml" : "g"}`
    })
}

const isSize = (w: string) => /^\d+(ml|g)$/.test(w)

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    prev = cur
  }
  return prev[b.length]
}

/** Dos palabras dicen lo mismo: iguales, abreviatura ("cab" / "cabernet") o un error de tipeo. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (/\d/.test(a) || /\d/.test(b)) {
    // "170" y "170g": el número sin unidad acepta la medida del otro lado.
    const num = (w: string) => w.replace(/^x/, "").replace(/(ml|g)$/, "")
    if (isSize(a) && isSize(b)) {
      // Mismo envase rotulado distinto: "995ML" y "1L" (se toleran diferencias de hasta 1 %).
      const [x, y] = [Number(num(a)), Number(num(b))]
      return a.slice(-1) === b.slice(-1) && Math.abs(x - y) <= Math.max(x, y) * 0.01
    }
    return num(a) === num(b)
  }
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true
  const n = Math.min(a.length, b.length)
  return lev(a, b) <= (n >= 4 ? 1 : 0) + (n >= 8 ? 1 : 0)
}

/** Une palabras vecinas que del otro lado van juntas: "mate cocido" / "matecocido", "25 saq" / "25saq". */
function joinPairs(words: string[], other: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const joined = words[i] + (words[i + 1] ?? "")
    if (i + 1 < words.length && other.includes(joined)) {
      out.push(joined)
      i++
    } else out.push(words[i])
  }
  return out
}

/** En qué difieren dos nombres. Sin diferencias (missing y extra vacíos) es el mismo producto. */
export function compareNames(fileName: string, productName: string): { missing: string[]; extra: string[] } {
  const rawA = nameWords(fileName)
  const rawB = nameWords(productName)
  for (const [x, y] of EXCLUSIVE) {
    if ((rawA.includes(x) && rawB.includes(y)) || (rawA.includes(y) && rawB.includes(x))) {
      return { missing: [x], extra: [y] }
    }
  }
  const significant = (w: string) => !FILLER.has(w)
  let a = rawA.filter(significant)
  let b = rawB.filter(significant)
  a = joinPairs(a, b)
  b = joinPairs(b, a)
  const used = new Set<number>()
  const missing: string[] = []
  for (const w of a) {
    const j = b.findIndex((v, k) => !used.has(k) && sameWord(w, v))
    if (j < 0) missing.push(w)
    else used.add(j)
  }
  const extra = b.filter((_, k) => !used.has(k))
  // La medida que falta de un lado no contradice: "ALMA MORA BLANCO" = "ALMA MORA BLANCO 750ML".
  const sizesA = a.some(isSize)
  const sizesB = b.some(isSize)
  return {
    missing: missing.filter((w) => !(isSize(w) && !sizesB)),
    extra: extra.filter((w) => !(isSize(w) && !sizesA)),
  }
}

/** Nombre del archivo sin la extensión. */
export const fileStem = (file: string) => file.replace(/\.[a-z0-9]+$/i, "").trim()

/**
 * Busca el artículo de una foto. "exacta" cuando algún nombre de un artículo no difiere en nada:
 * si hay varios así (la versión FRÍA, o el mismo artículo cargado dos veces) la foto va a todos.
 */
export function matchPhotoFile(file: string, products: FolderProduct[]): FolderMatch {
  const stem = fileStem(file)
  const articles = new Map<string, { diff: number; missing: string[]; extra: string[]; name: string; baseId: number; basePack: number }>()
  for (const p of products) {
    const key = folderArticleKey(p)
    const { missing, extra } = compareNames(stem, p.name)
    const diff = missing.length + extra.length
    const prev = articles.get(key)
    const better = !prev || diff < prev.diff || (diff === prev.diff && missing.length < prev.missing.length)
    const base = !prev || p.packSize < prev.basePack || (p.packSize === prev.basePack && p.id < prev.baseId)
    articles.set(key, {
      ...(better ? { diff, missing, extra, name: p.name } : { diff: prev.diff, missing: prev.missing, extra: prev.extra, name: prev.name }),
      baseId: base ? p.id : prev.baseId,
      basePack: base ? p.packSize : prev.basePack,
    })
  }
  const ranked = [...articles].sort(([ka, a], [kb, b]) => a.diff - b.diff || a.missing.length - b.missing.length || ka.localeCompare(kb))
  if (ranked.length === 0) return { kind: "sin-producto", articles: [], productIds: [], closest: null, missing: [], extra: [] }
  const [, best] = ranked[0]
  if (best.diff === 0) {
    const exact = ranked.filter(([, a]) => a.diff === 0)
    return {
      kind: "exacta",
      articles: exact.map(([k]) => k),
      productIds: exact.map(([, a]) => a.baseId),
      closest: best.name,
      missing: [],
      extra: [],
    }
  }
  // Pocas palabras distintas: queda pendiente en el más parecido para que el dueño lo confirme.
  const near = best.diff <= 3 && best.missing.length <= 2
  return {
    kind: near ? "dudosa" : "sin-producto",
    articles: near ? [ranked[0][0]] : [],
    productIds: near ? [best.baseId] : [],
    closest: best.name,
    missing: best.missing,
    extra: best.extra,
  }
}
