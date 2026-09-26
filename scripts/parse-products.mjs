// Lista de precios en Excel -> data/products.json (nombre, precio, categoría, packSize, groupKey).
// Uso: node scripts/parse-products.mjs [ruta.xlsx]
// Usa la misma lógica que la importación del admin (lib/price-list.ts, lib/pack.ts, lib/categorize.ts).
import { read, utils } from "xlsx"
import { readFileSync, writeFileSync } from "node:fs"
import { extractPriceRows } from "../lib/price-list.ts"
import { parsePresentation } from "../lib/pack.ts"
import { categorize } from "../lib/categorize.ts"

const path = process.argv[2] || "data/LISTA-NEGOCIOS-SEPTIEMBRE-e9a57b.xlsx"
const wb = read(readFileSync(path))
const sheet = wb.Sheets[wb.SheetNames[0]]
const { rows, skipped, headerRow } = extractPriceRows(utils.sheet_to_json(sheet, { header: 1, defval: null }))

const byName = new Map()
for (const { name, price } of rows) {
  const { packSize, groupKey } = parsePresentation(name)
  byName.set(name.toUpperCase(), { name, price, category: categorize(name), packSize, groupKey })
}
const products = [...byName.values()]
const duplicates = rows.length - products.length

const byCategory = {}
for (const p of products) byCategory[p.category] = (byCategory[p.category] || 0) + 1

const groups = new Map()
for (const p of products) groups.set(p.groupKey, [...(groups.get(p.groupKey) ?? []), p])
const multi = [...groups.values()].filter((g) => g.length > 1)

console.log(`Encabezado en la fila ${headerRow + 1}. ${products.length} productos (${skipped} filas omitidas, ${duplicates} duplicadas).`)
console.log("Por categoría:", byCategory)
console.log(`Packs: ${products.filter((p) => p.packSize > 1).length}. Artículos con más de una presentación: ${multi.length}`)
for (const g of multi) console.log(`  ${g[0].groupKey}: ${g.map((p) => `${p.name} (x${p.packSize})`).join(" | ")}`)

writeFileSync("data/products.json", JSON.stringify(products, null, 2) + "\n")
console.log("Escrito data/products.json")
