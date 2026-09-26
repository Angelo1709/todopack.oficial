import { read, utils } from "xlsx"
import { readFileSync, writeFileSync } from "node:fs"

// Shared categorization logic (keyword-based). Mirrors lib/categorize.ts.
const RULES = [
  ["Gaseosas", ["gaseosa", "7up", "pepsi", "coca", "sprite", "fanta", "mirinda", "paso de los toros", "manaos", "cunnington", "seven", "tonica", "pomelo", "naranja", "lima limon", "cola"]],
  ["Aguas", ["agua", "soda", "villavicencio", "villa del sur", "eco de los andes", "sifon"]],
  ["Cervezas", ["cerveza", "quilmes", "brahma", "stella", "heineken", "andes", "corona", "imperial", "patagonia", "schneider", "budweiser", "miller", "porron", "lata cerv"]],
  ["Vinos", ["vino", "tinto", "blanco", "malbec", "cabernet", "chardonnay", "rose", "espumante", "champ", "termidor", "toro", "uvita", "fond de cave", "dada"]],
  ["Aperitivos y Licores", ["fernet", "gancia", "campari", "aperitivo", "whisky", "vodka", "gin", "ron", "aperol", "cynar", "licor", "vermouth", "branca", "1882", "smirnoff", "skyy"]],
  ["Jugos e Isotónicas", ["jugo", "cepita", "baggio", "ades", "citric", "levite", "aquarius", "powerade", "gatorade", "speed", "monster", "red bull", "energizante", "isot"]],
  ["Snacks y Golosinas", ["papas", "palitos", "chizitos", "snack", "mani", "galletita", "alfajor", "chocolate", "caramelo", "chicle", "turron", "pop", "doritos", "lays", "9 de oro", "criollita"]],
  ["Almacén", ["azucar", "yerba", "harina", "aceite", "arroz", "fideo", "polenta", "sal", "cafe", "te ", "mate cocido", "conserva", "arveja", "lenteja", "pure", "mayonesa", "ketchup", "mostaza", "vinagre", "caldo"]],
  ["Lácteos", ["leche", "queso", "yogur", "manteca", "dulce de leche", "crema"]],
  ["Limpieza", ["lavandina", "detergente", "jabon", "limpiador", "desodorante ambiente", "cif", "ayudin", "esponja", "trapo", "escoba", "papel higienico", "rollo cocina", "servilleta"]],
  ["Descartables y Packaging", ["descartable", "vaso", "plato", "cubierto", "bandeja", "film", "bolsa", "papel", "servilleta", "sorbete", "pote", "contenedor", "aluminio", "tenedor", "cuchara", "pack "]],
]

function categorize(desc) {
  const d = desc.toLowerCase()
  for (const [cat, kws] of RULES) {
    for (const kw of kws) {
      if (d.includes(kw)) return cat
    }
  }
  return "Otros"
}

const path = process.argv[2] || "data/LISTA-NEGOCIOS-SEPTIEMBRE-e9a57b.xlsx"
const buf = readFileSync(path)
const wb = read(buf, { cellDates: true })
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = utils.sheet_to_json(sheet, { defval: null })

// Detect the description and price columns from headers
const sample = rows[0] || {}
const keys = Object.keys(sample)
const descKey = keys.find((k) => /desc|art|producto|nombre/i.test(k)) || keys[0]
const priceKey = keys.find((k) => /precio|price|\$/i.test(k)) || keys[1]

const products = []
for (const r of rows) {
  const name = (r[descKey] ?? "").toString().trim()
  let price = r[priceKey]
  if (typeof price === "string") price = Number(price.replace(/[^0-9.,]/g, "").replace(".", "").replace(",", "."))
  if (!name || !price || Number.isNaN(price)) continue
  products.push({ name, price: Math.round(Number(price)), category: categorize(name) })
}

const byCat = {}
for (const p of products) byCat[p.category] = (byCat[p.category] || 0) + 1
console.log("[v0] total products:", products.length)
console.log("[v0] categories:", byCat)
console.log("[v0] sample:", products.slice(0, 8))

writeFileSync("data/products.json", JSON.stringify(products, null, 2))
console.log("[v0] wrote data/products.json")
