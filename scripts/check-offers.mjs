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
// Descuento web general (lib/promo.ts): se aplica a toda presentación y no se suma a la oferta propia.
{
 const { tierPrice, withoutWebDiscount } = await import("../lib/pricing.ts")
 const { visibleOffer } = await import("../lib/offers.ts")
 const { activeWebDiscount, announcementOf, PROMO_DEFAULTS } = await import("../lib/promo.ts")
 const web = (t, pct = 10) => ({ ...t, webDiscount: pct })
 const plain = { ...unit, offer: null }
 assert.equal(tierPrice(web(plain)), 90)
 assert.equal(priceFor([web(plain)], 3).total, 270)
 assert.equal(priceFor([web({ ...plain, price: 1234 })], 1).total, 1111, "Redondea a pesos por presentación")
 // Precio por tramos con descuento: 7 u. = pack x6 (480 → 432) + 1 u. (100 → 90).
 const b = priceFor([web(plain), web(pack)], 7)
 assert.equal(b.total, 522)
 assert.deepEqual(b.lines.map(({ tier, count }) => [tier.packSize, tier.price, count]), [[6, 432, 1], [1, 90, 1]])
 assert.ok(b.lines.every(({ tier }) => !tier.webDiscount), "Las líneas guardan el precio pagado, sin volver a descontar")
 assert.equal(b.lines.reduce((n, { tier, count }) => n + tier.price * count, 0), b.total)
 // Oferta porcentual: gana la mayor, no se suman.
 const pct20 = { ...offer, kind: "percent", percent: 20 }
 assert.equal(priceFor([web({ ...unit, offer: pct20 })], 1).total, 80)
 assert.equal(priceFor([web({ ...unit, offer: { ...pct20, percent: 5 } })], 1).total, 90)
 assert.equal(visibleOffer({ ...pct20, percent: 5 }, 10), null)
 assert.equal(visibleOffer(pct20, 10)?.percent, 20)
 assert.equal(visibleOffer(offer, 10)?.kind, "bundle")
 // Combo 2x1: va a precio de lista; lo suelto, con descuento web. Se cobra lo más barato.
 assert.equal(priceFor([web(unit)], 1).total, 90)
 assert.equal(priceFor([web(unit)], 2).total, 100)
 assert.equal(priceFor([web(unit)], 3).total, 190)
 assert.equal(priceFor([web(unit, 60)], 2).total, 80, "Con un descuento web mayor al combo, conviene lo suelto")
 // Sin descuento web vuelve el precio de lista (lo usa el carrito para mostrar el ahorro).
 assert.equal(priceFor(withoutWebDiscount([web(plain)]), 3).total, 300)
 assert.equal(priceFor([web(plain, 0)], 3).total, 300)
 // Una oferta tapada por el descuento web no cuenta para el ahorro: $100 tachado → $90 = $10 por unidad.
 const covered = web({ ...unit, offer: { ...pct20, percent: 5 } })
 assert.equal(priceFor(withoutWebDiscount([covered]), 1).total, 100)
 assert.equal(priceFor(withoutWebDiscount([web({ ...unit, offer: pct20 })]), 1).total, 80, "Una oferta mayor se mantiene")
 assert.equal(priceFor(withoutWebDiscount([web(unit)]), 2).total, 100, "El 2x1 se mantiene")
 // Configuración: apagado o fuera de rango = sin descuento; barra con texto automático.
 assert.equal(activeWebDiscount(PROMO_DEFAULTS), 0)
 assert.equal(activeWebDiscount({ ...PROMO_DEFAULTS, webDiscountActive: true, webDiscountPercent: 15 }), 15)
 assert.equal(activeWebDiscount({ ...PROMO_DEFAULTS, webDiscountActive: true, webDiscountPercent: 80 }), 0)
 assert.equal(announcementOf({ ...PROMO_DEFAULTS, announcementActive: true }), null)
 assert.match(announcementOf({ ...PROMO_DEFAULTS, announcementActive: true, webDiscountActive: true }), /^10% OFF/)
 assert.equal(announcementOf({ ...PROMO_DEFAULTS, announcementActive: true, announcementText: " Envío gratis " }), "Envío gratis")
 assert.equal(announcementOf({ ...PROMO_DEFAULTS, announcementText: "Envío gratis" }), null)
 console.log("OK: descuento web general, redondeo, tramos, no acumulable con ofertas y barra de anuncio")
}
