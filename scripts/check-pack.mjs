// Verificación de parsePresentation / normalizeGroupKey / categorize con casos reales de la lista.
// Uso: node scripts/check-pack.mjs   (sale con código 1 si algún caso falla)
import { parsePresentation, presentationLabel, packSavingsPercent } from "../lib/pack.ts"
import { categorize } from "../lib/categorize.ts"
import { extractPriceRows, parsePrice } from "../lib/price-list.ts"

// [nombre, packSize, label, groupKey esperado (opcional)]
const CASES = [
  ["COCA COLA 1.5L UNIDAD", 1, "Unidad", "coca cola 1.5l"],
  ["COCA COLA 1.5L PACK X6", 6, "Pack x6", "coca cola 1.5l"],
  ["COCA COLA DESCART 1.5 LTS PACK X8", 8, "Pack x8", "coca cola 1.5l"],
  ["7UP 1.5 LT DESCARTABLE PACK X6", 6, "Pack x6", "7up 1.5l"],
  ["COCA COLA 2.25L  PACK X6", 6, "Pack x6", "coca cola 2.25l"],
  ["PEPSI 1.5 LT PACK X 6", 6, "Pack x6", "pepsi 1.5l"],
  ["COCA COLA CAJON RETORN 2L X8", 8, "Cajón x8", "coca cola retornable 2l"],
  ["BRAHMA CERVEZA CAJON 1L RETORNABLE X12", 12, "Cajón x12", "brahma cerveza retornable 1l"],
  ["IGUANA CERVEZA 1L CAJON X12", 12, "Cajón x12", "iguana cerveza 1l"],
  ["ACEITE NATURA 900ML CAJA X15", 15, "Caja x15", "aceite natura 900ml"],
  ["ESTANCIA MDZ CABER SAU CAJA X 6", 6, "Caja x6", "estancia mdz caber sau"],
  ["COSTA DEL SOL VINAGRE 5LT PACK X2", 2, "Pack x2", "costa del sol vinagre 5l"],
  ["COSTA DEL SOL VINAGRE 5LT UNIDAD", 1, "Unidad", "costa del sol vinagre 5l"],
  ["CORONA 710ML X12", 12, "Pack x12", "corona 710ml"],
  ["BAGGIO 1L MULTIFRUTA X8", 8, "Pack x8", "baggio multifruta 1l"],
  ["CERVEZA MARADONA 1L X6", 6, "Pack x6", "cerveza maradona 1l"],
  ["FANTA 1.5L DESCARTABLE  X8", 8, "Pack x8", "fanta 1.5l"],
  ["GANCIA LATA C/ALCOHOL 473 X6", 6, "Pack x6", "gancia lata c/alcohol 473"],
  ["BAGGIO MULTIFRUTA X200ML CAJA X18", 18, "Caja x18", "baggio multifruta 200ml"],
  ["V ASUNCION BIDON AGUA MINER PACK X2 5LTS", 2, "Pack x2", "v asuncion bidon agua miner 5l"],
  ["ROLLO COCINA SUSSEX  50P X 3 PACK X 10", 10, "Pack x10", "rollo cocina sussex 50p x 3"],
  ["LA QUESERA DISPLEY X20 SOBRES 40G", 20, "Display x20", "la quesera 40g"],
  ["LA QUESERA 40GR UNIDAD", 1, "Unidad", "la quesera 40g"],
  ["PAPEL HIG HIGIENOL FRESH 30MX4 PACK12", 12, "Pack x12", "papel hig higienol fresh 30mx4"],
  ["PAPEL HIG. HIGIENOL FRESH 30MX4 UNIDAD", 1, "Unidad", "papel hig higienol fresh 30mx4"],
  // "X N" sin volumen de bebida = contenido del envase (queda en el nombre y en el grupo).
  ["CLIGHT  LIMONADA ARANDANO JUGO EN POLVO  X20SOBRES", 1, "Unidad"],
  ["CLIGHT MANZANA VERDE JUGO EN POLVO X20 SOBRES", 1, "Unidad"],
  ["BON O BON BOMBONES X30 15GR NEGRO", 1, "Unidad"],
  ["TIO NELIDO ALFAJOR MAICENA X15", 1, "Unidad", "tio nelido alfajor maicena x15"],
  ["TIO NELIDO ALFAJOR MAICENA X6", 1, "Unidad", "tio nelido alfajor maicena x6"],
  ["LA VIRGINIA CAFE SAQUITO X20", 1, "Unidad", "la virginia cafe saquito x20"],
  ["LA VIRGINIA CAFE SAQUITO X20 PACK X10", 10, "Pack x10", "la virginia cafe saquito x20"],
  ["MORTIMER LANA ACERO X12 UNIDADES", 1, "Unidad"],
  ["BOLITAS CROCANTES x 800G UNIDAD", 1, "Unidad", "bolitas crocantes 800g"],
  // "PACK" sin cantidad no es un pack ("pack ahorro" es el envase).
  ["CAFE LA VIRGINIA CLAS PACK AHORRO 170G", 1, "Unidad", "cafe la virginia clas pack ahorro 170g"],
  ["BOLSON FAMILIAR NUMERO 1", 1, "Unidad"],
  // Variantes de "unidad".
  ["PIATTELLI SALTA MALBEC 750ML U", 1, "Unidad", "piattelli salta malbec"],
  ["ENCUENTRO VINO MALBEC 750ML UNI", 1, "Unidad", "encuentro malbec"],
  ["DESO AMB GLADE AERO PARAISO AZUL 360CC UNID", 1, "Unidad", "deso amb glade aero paraiso azul 360ml"],
  ["VINO FABRE MONTMAYOU MALBEC UNIDAD 750 ML", 1, "Unidad", "fabre montmayou malbec"],
  ["CAÑA PIRAGUA 950CC UNIDAD", 1, "Unidad", "cana piragua 950ml"],
]

const PAIRS = [
  // Deben compartir groupKey.
  ["COSTA DEL SOL VINAGRE 5LT PACK X2", "COSTA DEL SOL VINAGRE 5LT UNIDAD", true],
  ["CELUSAL SAL GRUESA 500GR PACK X30", "CELUSAL SAL GRUESA 500GR UNIDAD", true],
  ["LA HOJA YERBA 500G PACK X10", "LA HOJA YERBA 500G UNIDAD", true],
  ["LA HUERTA PURE DE TOMATE 530G CAJA X12", "LA HUERTA PURE DE TOMATE 530G UNIDAD", true],
  ["HELLMANNS MAYONESA 237G CAJA X24", "HELLMANNS MAYONESA 237GR UNIDAD", true],
  ["SOL MAYOR ROLLO DE COCINA 40P PACK  X12", "SOL MAYOR ROLLO DE COCINA 40P UNIDAD", true],
  ["COCA COLA 1,5 LTS UNIDAD", "COCA COLA 1.5L PACK X6", true],
  // "VINO" y la botella de 750 ml se ignoran al agrupar.
  ["PORTILLO MALBEC CAJA X6", "PORTILLO VINO MALBEC 750CC UNIDAD", true],
  ["LAS PERDICES RESERVA MALBEC CAJA X6", "LAS PERDICES RESERVA MALBEC VINO 750ML UNIDAD", true],
  // No deben agruparse.
  ["TIO NELIDO ALFAJOR MAICENA X15", "TIO NELIDO ALFAJOR MAICENA X6", false],
  ["CHANDON EXTRA BRUT 187ML UNIDAD", "CHANDON EXTRA BRUT UNIDAD", false],
  ["COCA COLA 500 ML PACK X12", "COCA COLA ZERO 1.5L PACK X8", false],
  ["J. WALKER RED 1000CC UNIDAD", "J. WALKER RED 750CC UNIDAD", false],
  ["VASO DESCARTABLE 200CC PACK X50", "VASO 200CC UNIDAD", false],
]

const CATEGORIES = [
  ["AGUA MINERAL MANAOS 600ML PACK X12", "Aguas"],
  ["SODA MANAOS X12", "Aguas"],
  ["MANAOS COLA 3L PACK X6", "Gaseosas"],
  ["ACEITUNA VERDE ENTERA 180GR UNIDAD", "Almacén"],
  ["ZUELO ACEITE OLIVA ORIGINAL 500ML UNIDAD", "Almacén"], // "original" contiene "gin"
  ["AYUDIN LAVANDINA 2L ORIGINAL UNIDAD", "Limpieza"],
  ["FANTASIA TURRON BAÑADO 80GR UNIDAD", "Snacks y Golosinas"],
  ["TANG POMELO ROSADO JUGO EN POLVO CAJA X20 SOBRES", "Jugos e Isotónicas"],
  ["PASO DE LOS TOROS POMELO 1.5L UNIDAD", "Gaseosas"],
  ["TORO BOTELLON 1L PACK X6", "Vinos"],
  ["LICOR CUSENIER 700CC DULCE D LECHE", "Aperitivos y Licores"],
  ["J.WALKER GOLD RESERVA 750CC UNIDAD", "Aperitivos y Licores"],
  ["WHISKY BLENDERS PRIDE 750CC UNIDAD", "Aperitivos y Licores"],
  ["COPA CHAMPAGNE", "Otros"],
  ["CAJA LAS PERDICES CHAMP + COPA", "Vinos"],
  ["CONSERVADORA CORONA 15LITROS", "Otros"],
  ["CORONA 710ML X12", "Cervezas"],
  ["COSTA DEL SOL JUGO DE LIMON X12", "Almacén"],
  ["GODET FLAN DULCE DE LECHE 25GR UNIDAD", "Almacén"],
  ["BONAFIDE CEREAL BAÑO DE LECHE 80GR UNIDAD", "Snacks y Golosinas"],
  ["LA SERENISIMA DDL CLASICO 250GR UNIDAD", "Lácteos"],
  ["CELUSAL SAL FINA ESTUCHE 500GR UNIDAD", "Almacén"],
  ["ARCOR TOMATE PERITA 400GR UNIDAD", "Almacén"],
  ["SEDAL SHAMPOO BALANCE 300ML UNIDAD", "Limpieza"],
]

let failures = 0
let checks = 0
function check(ok, message) {
  checks++
  if (!ok) {
    failures++
    console.log(`  FALLA  ${message}`)
  }
}

for (const [name, packSize, label, groupKey] of CASES) {
  const p = parsePresentation(name)
  check(p.packSize === packSize, `${name}: packSize ${p.packSize} (esperado ${packSize})`)
  check(p.label === label, `${name}: label "${p.label}" (esperado "${label}")`)
  if (groupKey !== undefined) check(p.groupKey === groupKey, `${name}: groupKey "${p.groupKey}" (esperado "${groupKey}")`)
}

for (const [a, b, same] of PAIRS) {
  const ka = parsePresentation(a).groupKey
  const kb = parsePresentation(b).groupKey
  check((ka === kb) === same, `${a} / ${b}: "${ka}" vs "${kb}" (${same ? "deberían" : "no deberían"} agruparse)`)
}

for (const [name, category] of CATEGORIES) {
  const got = categorize(name)
  check(got === category, `${name}: categoría "${got}" (esperada "${category}")`)
}

check(presentationLabel("ACEITE NATURA 900ML CAJA X15", 15) === "Caja x15", "presentationLabel usa la palabra del nombre")
check(presentationLabel("ACEITE NATURA 900ML CAJA X15", 12) === "Pack x12", "presentationLabel con pack corregido a mano")
check(presentationLabel("CUALQUIERA", 1) === "Unidad", "presentationLabel unidad")
check(packSavingsPercent(6000, 6, 1100) === 9, "ahorro 6000/6 vs 1100 = 9%")
check(packSavingsPercent(7200, 6, 1100) === 0, "sin ahorro si el pack sale más caro")

check(parsePrice("$ 15.000") === 15000, 'parsePrice("$ 15.000")')
check(parsePrice("1.234,56") === 1235, 'parsePrice("1.234,56")')
check(parsePrice(15000.01) === 15000, "parsePrice(15000.01)")
const sheet = [
  [null, null],
  ["LISTA DE PRECIOS", null],
  [null, "Descripcion Articulo", "Precio"],
  [null, "COCA COLA 1.5L PACK X6", 15000],
  [null, "SIN PRECIO", null],
  [null, null, null],
  [null, "AGUA 2L", "$ 1.200"],
]
const extracted = extractPriceRows(sheet)
check(extracted.headerRow === 2 && extracted.nameCol === 1 && extracted.priceCol === 2, "extractPriceRows detecta el encabezado")
check(extracted.rows.length === 2 && extracted.skipped === 1, "extractPriceRows lee 2 filas y omite 1")
const erpSheet = [
  [
    "Rubro",
    "Descripcion",
    "IdArticulo",
    "Codigo Articulo",
    "Codigo Barras",
    "Descripcion Articulo",
    "Precio",
    "Codigo proveedor",
    "Proveedor",
  ],
  [21, "BEBIDAS", 547, 2019, null, "COCA COLA 2.5L PACK X6", 32000, 1, "GENERAL"],
  [21, "BEBIDAS", 723, 2490, null, "COCA COLA 2.5L UNIDAD", 6000, 1, "GENERAL"],
]
const extractedErp = extractPriceRows(erpSheet)
check(
  extractedErp.nameCol === 5 && extractedErp.priceCol === 6,
  'extractPriceRows prioriza "Descripción Artículo" sobre el rubro "Descripción"',
)
check(
  extractedErp.rows.map((r) => r.name).join("|") === "COCA COLA 2.5L PACK X6|COCA COLA 2.5L UNIDAD",
  "extractPriceRows conserva las presentaciones pack y unidad del ERP",
)
const noHeader = extractPriceRows([["COCA COLA", 100], ["PEPSI", 90]])
check(noHeader.rows.length === 2 && noHeader.headerRow === -1, "extractPriceRows sin encabezado")

console.log(
  failures
    ? `\n${failures} de ${checks} verificaciones fallaron.`
    : `OK: ${checks} verificaciones pasaron (${CASES.length} nombres de la lista, ${PAIRS.length} pares, ${CATEGORIES.length} categorías).`,
)
process.exit(failures ? 1 : 0)
