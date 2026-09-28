// Verificaciones de la sincronización con el sistema del local (lib/stock-sync.ts).
// Uso: node scripts/check-sync.mjs
import assert from "node:assert/strict"
import {
  finalPrice,
  fixMojibake,
  hasStock,
  matchByName,
  normalizeName,
  parseSyncPayload,
  SYNC_MAX_ARTICLES,
} from "../lib/stock-sync.ts"

let n = 0
const check = (name, fn) => {
  try {
    fn()
  } catch (err) {
    console.error(`✗ ${name}`)
    throw err
  }
  n++
}

const art = (over = {}) => ({ id: 57, codigo: "57", nombre: "COCA COLA CAJON RETORN 2L X8", precioNeto: 12396.69, iva: 21, stock: 3, ...over })
const parse = (articulos, extra = {}) => parseSyncPayload({ equipo: "CAJA", articulos, ...extra })

// ---- Precio ----

check("precio final: neto + IVA redondeado a pesos", () => {
  assert.equal(finalPrice(12396.69421487603, 21), 15000)
  assert.equal(finalPrice(991.7355371900826, 21), 1200)
  assert.equal(finalPrice(1000, 10.5), 1105)
  assert.equal(finalPrice(1000, 0), 1000)
  assert.equal(finalPrice(0, 21), 0)
})

// ---- Nombres ----

check("repara Ñ y acentos mal codificados (UTF-8 leído como Windows-1252)", () => {
  assert.equal(fixMojibake("CAÃ‘A PIRAGUA 950CC UNIDAD"), "CAÑA PIRAGUA 950CC UNIDAD")
  assert.equal(fixMojibake("MAÃ‘ANITA YERBA 500GR"), "MAÑANITA YERBA 500GR")
  assert.equal(fixMojibake("CafÃ© con leche"), "Café con leche")
  assert.equal(fixMojibake("LIMÃ“N"), "LIMÓN")
})

check("no toca texto que ya está bien", () => {
  for (const s of ["CAÑA PIRAGUA", "COCA COLA 2L", "Ã sola al final Ã", "ÁRBOL Ñandú"]) assert.equal(fixMojibake(s), s)
})

check("normalizar: sin acentos, mayúsculas y espacios simples", () => {
  assert.equal(normalizeName("  coca   cola 2.25L  pack x6 "), "COCA COLA 2.25L PACK X6")
  assert.equal(normalizeName("CAÑA PIRAGUA"), normalizeName("CAÃ‘A PIRAGUA"))
  assert.equal(normalizeName("Café"), "CAFE")
})

// ---- Emparejamiento ----

check("empareja por nombre normalizado, uno a uno", () => {
  const pairs = matchByName(
    [
      { systemId: 1, name: "CAÃ‘A PIRAGUA 950CC UNIDAD" },
      { systemId: 2, name: "COCA COLA 2.25L PACK X6" },
      { systemId: 3, name: "SOLO EN EL SISTEMA" },
    ],
    [
      { id: 10, name: "CAÑA PIRAGUA 950CC UNIDAD" },
      { id: 11, name: "COCA COLA 2.25L  PACK X6" },
      { id: 12, name: "SOLO EN LA WEB" },
    ],
  )
  assert.deepEqual(pairs, [
    { systemId: 1, productId: 10 },
    { systemId: 2, productId: 11 },
  ])
})

check("nombres repetidos (en cualquiera de los dos lados) no se emparejan solos", () => {
  assert.deepEqual(
    matchByName(
      [
        { systemId: 1, name: "AGUA 2L" },
        { systemId: 2, name: "agua  2l" },
        { systemId: 3, name: "SODA 2L" },
      ],
      [
        { id: 10, name: "AGUA 2L" },
        { id: 11, name: "SODA 2L" },
        { id: 12, name: "Soda 2L" },
      ],
    ),
    [],
  )
})

// ---- Validación de lo que manda la PC ----

check("acepta un envío normal y redondea el stock", () => {
  const r = parse([art(), art({ id: 58, nombre: "SPRITE", stock: "2.6", precioNeto: "100", iva: "10.5", codigo: 58 })])
  assert.ok(r.ok)
  assert.equal(r.payload.equipo, "CAJA")
  assert.equal(r.payload.articulos[1].stock, 3)
  assert.equal(r.payload.articulos[1].codigo, "58")
  assert.equal(r.payload.articulos[1].iva, 10.5)
})

check("campos vacíos de Access: precio, IVA y stock se toman como 0", () => {
  const r = parse([art({ precioNeto: null, iva: "", stock: null })])
  assert.ok(r.ok)
  assert.deepEqual([r.payload.articulos[0].precioNeto, r.payload.articulos[0].iva, r.payload.articulos[0].stock], [0, 0, 0])
})

check("stock negativo se conserva (se muestra como sin stock)", () => {
  const r = parse([art({ stock: -4 })])
  assert.ok(r.ok)
  assert.equal(r.payload.articulos[0].stock, -4)
  assert.equal(hasStock(-4), false)
  assert.equal(hasStock(0), false)
  assert.equal(hasStock(1), true)
  assert.equal(hasStock(null), true)
})

check("repara el nombre al recibirlo", () => {
  const r = parse([art({ nombre: "  CAÃ‘A   PIRAGUA " })])
  assert.ok(r.ok)
  assert.equal(r.payload.articulos[0].nombre, "CAÑA PIRAGUA")
})

check("rechaza envíos inválidos entero (no actualiza a medias)", () => {
  const bad = [
    [null, "objeto"],
    [{ articulos: "x" }, "lista"],
    [{ articulos: [] }, "vacía"],
    [{ articulos: [art(), art()] }, "repetido"],
    [{ articulos: [art({ id: 0 })] }, "id"],
    [{ articulos: [art({ id: 1.5 })] }, "id"],
    [{ articulos: [art({ nombre: "  " })] }, "nombre"],
    [{ articulos: [art({ precioNeto: -1 })] }, "precio"],
    [{ articulos: [art({ precioNeto: "abc" })] }, "precio"],
    [{ articulos: [art({ iva: 121 })] }, "IVA"],
    [{ articulos: [art({ stock: "muchos" })] }, "stock"],
    [{ articulos: Array.from({ length: SYNC_MAX_ARTICLES + 1 }, (_, i) => art({ id: i + 1 })) }, "Demasiados"],
  ]
  for (const [body, expected] of bad) {
    const r = parseSyncPayload(body)
    assert.equal(r.ok, false, JSON.stringify(body)?.slice(0, 80))
    assert.match(r.error, new RegExp(expected), r.error)
  }
})

check("el error dice qué artículo falló", () => {
  const r = parse([art(), art({ id: 99, precioNeto: -5 })])
  assert.equal(r.ok, false)
  assert.match(r.error, /Artículo 2 \(id 99\)/)
})

console.log(`check-sync: ${n} verificaciones OK`)
