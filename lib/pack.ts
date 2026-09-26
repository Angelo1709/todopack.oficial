// Presentaciones (unidad / pack / caja...) a partir del nombre de la lista de precios.
//
// "COCA COLA 1.5L UNIDAD" y "COCA COLA 1.5L PACK X6" son el mismo artículo: comparten
// groupKey y el segundo precio corresponde a 6 unidades (packSize = 6).
//
// Este archivo lo importan también los scripts .mjs (Node ejecuta .ts quitando los tipos):
// no usar alias "@/", imports sin extensión ni sintaxis TS no borrable (enum, namespace...).
// Sin lookbehind en las regex: puede terminar en el navegador y Safari viejo no lo soporta.

export type Presentation = {
  /** Unidades que incluye el precio (1 = unidad suelta). */
  packSize: number
  /** "Unidad", "Pack x6", "Caja x12", "Cajón x8"... */
  label: string
  /** Clave para agrupar presentaciones del mismo artículo. */
  groupKey: string
  /** Nombre sin el token de presentación, para mostrar. */
  baseName: string
}

const PACK_WORDS: Record<string, string> = {
  PACK: "Pack",
  CAJA: "Caja",
  CAJON: "Cajón",
  BULTO: "Bulto",
  FARDO: "Fardo",
  DISPLAY: "Display",
  DISPLEY: "Display", // así aparece en la lista
  BOLSON: "Bolsón",
  TIRA: "Tira",
}

const KEYWORD = "PACK|CAJA|CAJ[OÓ]N|BULTO|FARDO|DISPLAY|DISPLEY|BOLS[OÓ]N|TIRA"
// Palabras que pueden seguir a la cantidad: "X18U", "X20 SOBRES", "X4 BOTELLAS".
const COUNT_SUFFIX = "(?: ?(?:U|UN|UNID|UNIDADES|SOBRES|BOTELLAS|LATAS))?"
// La cantidad no puede seguir con letras o dígitos: "X200ML" es un volumen, no un pack.
const COUNT_END = "(?![\\p{L}\\d])"

// "PACK X6", "CAJA X 15", "CAJON RETORN 2L X8" (hasta 3 palabras entre la palabra clave y "X N").
// Grupo 1 = separador previo, 2 = palabra clave, 3 = palabras intermedias, 4 = cantidad.
const KEYWORD_PACK_RE = new RegExp(
  `(^|[^\\p{L}\\d])(${KEYWORD})((?: (?!X ?\\d)\\S+){0,3}?) X ?(\\d+)${COUNT_SUFFIX}${COUNT_END}`,
  "iu",
)
// "PACK12" / "PACK 12" (sin X, pegado a la palabra clave). Grupo 1 = separador, 2 = clave, 3 = cantidad.
const KEYWORD_NUMBER_RE = new RegExp(`(^|[^\\p{L}\\d])(${KEYWORD}) ?(\\d+)(?![\\p{L}\\d.,])`, "iu")
// "X N" al final sin palabra clave: "CORONA 710ML X12", "TIO NELIDO ALFAJOR MAICENA X15".
const TRAILING_COUNT_RE = new RegExp(`(?:^| )X ?(\\d+)${COUNT_SUFFIX}$`, "iu")
// Volumen de bebida (o lata): con esto un "X N" final es un pack y no el contenido del envase.
const DRINK_RE = /\d(?:[.,]\d+)? ?(?:ML|CC|L|LT|LTS|LITRO|LITROS)(?![\p{L}])|(?:^|[^\p{L}])LATAS?(?![\p{L}])/iu

const UNIT_ANYWHERE_RE = /(^|[^\p{L}\d])UNIDAD(?![\p{L}\d])/giu
const UNIT_AT_END_RE = / (?:UNID|UNI|UN|U)$/iu

const MAX_PACK = 1000

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function packWord(keyword: string): string {
  return PACK_WORDS[stripAccents(keyword.toUpperCase())] ?? "Pack"
}

function validCount(n: number): boolean {
  return Number.isInteger(n) && n >= 2 && n <= MAX_PACK
}

export function parsePresentation(rawName: string): Presentation {
  const name = collapse(String(rawName ?? ""))
  let packSize = 1
  let label = "Unidad"
  let base = name

  const keyword = KEYWORD_PACK_RE.exec(name)
  const keywordNumber = keyword ? null : KEYWORD_NUMBER_RE.exec(name)
  const trailing = keyword || keywordNumber ? null : TRAILING_COUNT_RE.exec(name)

  if (keyword) {
    const n = Number(keyword[4])
    if (validCount(n)) {
      packSize = n
      label = `${packWord(keyword[2])} x${n}`
    }
    // Se quitan la palabra clave y el "X N"; las palabras intermedias ("RETORN 2L") quedan.
    const start = keyword.index + keyword[1].length
    base = `${name.slice(0, start)} ${keyword[3]} ${name.slice(keyword.index + keyword[0].length)}`
  } else if (keywordNumber) {
    const n = Number(keywordNumber[3])
    if (validCount(n)) {
      packSize = n
      label = `${packWord(keywordNumber[2])} x${n}`
    }
    const start = keywordNumber.index + keywordNumber[1].length
    base = `${name.slice(0, start)} ${name.slice(keywordNumber.index + keywordNumber[0].length)}`
  } else if (trailing) {
    const n = Number(trailing[1])
    const rest = name.slice(0, trailing.index)
    // Sin volumen de bebida, "X20" describe el contenido (sobres, saquitos, alfajores): queda en el nombre.
    if (DRINK_RE.test(rest) && validCount(n)) {
      packSize = n
      label = `Pack x${n}`
      base = rest
    }
  }

  base = collapse(base.replace(UNIT_ANYWHERE_RE, "$1 ")).replace(UNIT_AT_END_RE, "")
  base = collapse(base).replace(/^[-–,.+/ ]+|[-–,+/ ]+$/g, "") || name

  return { packSize, label, groupKey: normalizeGroupKey(base), baseName: base }
}

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9"
const PACKAGING_RE = /(^| )(vasos?|platos?|bandejas?|cubiertos?|potes?|contenedor(es)?|copas?|bolsas?|film|sorbetes?|tenedor(es)?|cucharas?)( |$)/

/**
 * Normaliza un texto para usarlo como groupKey: minúsculas, sin acentos, espacios colapsados,
 * volúmenes y pesos unificados ("1,5 LTS" -> "1.5l", "750 CC" -> "750ml", "500GR" -> "500g").
 * También sirve para sanear un groupKey escrito a mano en el admin.
 */
export function normalizeGroupKey(text: string): string {
  let s = stripAccents(String(text ?? "").toLowerCase())
  s = s.replace(/(\d),(\d)/g, "$1.$2") // 1,5 -> 1.5
  // Puntos que no son decimales ("HIG.", "J.WALKER") pasan a espacio.
  s = s.replace(/\./g, (_m, i: number) => (isDigit(s[i - 1]) && isDigit(s[i + 1]) ? "." : " "))
  s = s.replace(/\s*\/\s*/g, "/") // "C/ PIEL" -> "c/piel"
  s = s.replace(/[^a-z0-9./+%]+/g, " ")
  // "x 800g", "x200ml": la x delante de una medida sobra.
  s = s.replace(
    /(^|[^a-z0-9])x ?(?=\d+(?:\.\d+)? ?(?:ml|cc|l|lt|lts|litros?|g|gr|grs|gramos|kg|kgs|k|kilos?)(?![a-z]))/g,
    "$1",
  )
  s = s.replace(/(\d+(?:\.\d+)?) ?(?:ml|cc)(?![a-z])/g, "$1ml")
  s = s.replace(/(\d+(?:\.\d+)?) ?(?:l|lt|lts|litro|litros)(?![a-z])/g, "$1l")
  s = s.replace(/(\d+(?:\.\d+)?) ?(?:kg|kgs|k|kilo|kilos)(?![a-z])/g, "$1kg")
  s = s.replace(/(\d+(?:\.\d+)?) ?(?:g|gr|grs|gramos)(?![a-z])/g, "$1g")
  s = s.replace(/(^|[^a-z])descart[a-z]*/g, "$1descartable")
  s = s.replace(/(^|[^a-z])retorn[a-z]*/g, "$1retornable")
  // En bebidas "descartable" es la opción por defecto: "COCA COLA DESCART 1.5 LTS" = "COCA COLA 1.5L".
  // (En vasos/platos no se quita: "VASO" y "VASO DESCARTABLE" son cosas distintas.)
  if (/\d(?:ml|l)(?![a-z])/.test(s) && !PACKAGING_RE.test(s)) {
    s = s.replace(/(^|[^a-z])descartable(?![a-z])/g, "$1 ")
  }
  // "VINO" es relleno y 750 ml es la botella estándar: "PORTILLO MALBEC CAJA X6" = "PORTILLO VINO MALBEC 750CC".
  s = s.replace(/(^| )vino(?= |$)/g, "$1 ").replace(/(^| )750ml(?= |$)/g, "$1 ")
  return collapse(s)
}

/**
 * Etiqueta de la presentación según el packSize guardado en la base (que el admin puede
 * haber corregido): usa la palabra del nombre ("Caja x12") si coincide, si no "Pack xN".
 */
export function presentationLabel(name: string, packSize: number): string {
  if (!packSize || packSize <= 1) return "Unidad"
  const parsed = parsePresentation(name)
  return parsed.packSize === packSize ? parsed.label : `Pack x${packSize}`
}

/** Precio por unidad redondeado a pesos enteros. */
export function unitPrice(price: number, packSize: number): number {
  return Math.round(price / Math.max(1, packSize || 1))
}

/** Porcentaje que se ahorra comprando el pack frente a la unidad suelta (0 si no conviene). */
export function packSavingsPercent(packPrice: number, packSize: number, singlePrice: number): number {
  if (packSize <= 1 || singlePrice <= 0) return 0
  const pct = Math.floor((1 - packPrice / packSize / singlePrice) * 100)
  return pct > 0 ? pct : 0
}
