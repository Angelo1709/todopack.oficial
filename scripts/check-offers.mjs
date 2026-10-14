import assert from "node:assert/strict"
import { priceFor } from "../lib/pricing.ts"
const offer = { title: "Oferta", kind: "bundle", percent: 20, buy: 2, pay: 1, active: true }
const unit = { productId: 1, name: "Unidad", label: "Unidad", packSize: 1, price: 100, offer }
const pack = { productId: 2, name: "Pack x6", label: "Pack x6", packSize: 6, price: 480 }
for (const [qty, total] of [[1,100],[2,100],[3,200],[4,200],[7,400]]) assert.equal(priceFor([unit], qty).total,total)
assert.equal(priceFor([{ ...unit, offer: { ...offer, active: false } }], 2).total,200)
assert.equal(priceFor([{ ...unit, offer: { ...offer, kind: "percent" } }], 3).total,240)
assert.equal(priceFor([{ ...unit, offer: { ...offer, buy: 3, pay: 2 } }], 4).total,300)
assert.equal(priceFor([unit, pack], 6).total,300)
assert.equal(priceFor([{ ...pack, offer }], 12).total,480)
assert.equal(priceFor([{ ...pack, offer }], 6).total,480)
assert.equal(priceFor([{ ...pack, offer }], 7),null)
for (let qty = 1; qty <= 30; qty++) {
 const b = priceFor([unit, pack],qty)
 assert.equal(b.lines.reduce((n,{tier,count}) => n + tier.packSize * count, 0),qty)
 assert.equal(b.lines.reduce((n,{tier,count}) => n + tier.price * count, 0),b.total)
 assert.ok(b.lines.every(({tier}) => tier.packSize === (tier.productId === 1 ? 1 : 6)))
}
assert.equal(priceFor([{ ...unit, price: 101, offer: { ...offer, kind: "percent" } }],3).total,243)
console.log("OK: ofertas, pausa, cantidades impares, packs, redondeo y reconciliación de stock/importe")
// Una oferta no debe desaparecer cuando otra fila tiene el mismo tamaño y precio de lista menor.
const duplicate = { ...unit, productId: 3, price: 120, offer: { ...offer, kind: "percent" } }
assert.equal(priceFor([{ ...unit, offer: null }, duplicate], 2).total,192)
const comboDuplicate = { ...unit, productId: 4, price: 150, offer }
assert.equal(priceFor([{ ...unit, offer: null }, comboDuplicate], 1).total,100)
assert.equal(priceFor([{ ...unit, offer: null }, comboDuplicate], 2).total,150)
