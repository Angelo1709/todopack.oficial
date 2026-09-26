// Verificaciones del precio por tramos (lib/pricing.ts). Uso: node scripts/check-pricing.mjs
import assert from "node:assert/strict"
import { describeBreakdown, nextTierHint, priceFor, savingsPercent, snapUnits, stepUnits } from "../lib/pricing.ts"

const t = (productId, packSize, price, label) => ({ productId, name: label, label, packSize, price })
const unidad = t(1, 1, 1100, "Unidad")
const pack6 = t(2, 6, 6000, "Pack x6")
const caja12 = t(3, 12, 11000, "Caja x12")

let n = 0
const check = (name, fn) => {
  fn()
  n++
}

check("ejemplo del cliente: 7 u. = 6000 + 1100", () => {
  const b = priceFor([unidad, pack6], 7)
  assert.equal(b.total, 7100)
  assert.equal(describeBreakdown(b), "1 pack x6 + 1 u.")
})
check("menos de un pack: todo por unidad", () => assert.equal(priceFor([unidad, pack6], 5).total, 5500))
check("pack justo", () => assert.equal(priceFor([unidad, pack6], 6).total, 6000))
check("13 u. = 2 packs + 1", () => assert.equal(priceFor([unidad, pack6], 13).total, 13100))
check("tres tramos: 19 u. = caja + pack + 1", () => {
  const b = priceFor([unidad, pack6, caja12], 19)
  assert.equal(b.total, 11000 + 6000 + 1100)
  assert.equal(describeBreakdown(b), "1 caja x12 + 1 pack x6 + 1 u.")
})
check("solo pack: múltiplos de 6", () => {
  assert.equal(stepUnits([pack6]), 6)
  assert.equal(priceFor([pack6], 4), null)
  assert.equal(priceFor([pack6], 12).total, 12000)
  assert.equal(snapUnits([pack6], 7), 12)
})
check("pack más caro que unidades sueltas: no se usa", () => {
  const caro = t(4, 6, 7000, "Pack x6")
  assert.equal(priceFor([unidad, caro], 6).total, 6600)
})
check("presentaciones duplicadas: gana la más barata", () => {
  assert.equal(priceFor([unidad, t(5, 1, 900, "Unidad")], 2).total, 1800)
})
check("sugerencia para llegar al pack", () => {
  const h = nextTierHint([unidad, pack6], 4)
  assert.equal(h.missing, 2)
  assert.equal(h.tier.packSize, 6)
  assert.equal(nextTierHint([unidad, pack6], 6), null)
  assert.equal(nextTierHint([unidad, pack6], 8).missing, 4)
  assert.equal(nextTierHint([unidad], 3), null)
})
check("ahorro por unidad", () => assert.equal(savingsPercent([unidad, pack6], pack6), 9))
check("cantidades inválidas", () => {
  assert.equal(priceFor([unidad], 0), null)
  assert.equal(priceFor([], 3), null)
  assert.equal(priceFor([unidad], 999999), null)
})

console.log(`OK: ${n} verificaciones de precios por tramos pasaron.`)
