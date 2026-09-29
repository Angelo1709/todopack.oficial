// Verificaciones del recorrido de reparto (lib/route.ts). Uso: node scripts/check-route.mjs
import assert from "node:assert/strict"
import {
  EXACT_MAX_STOPS,
  MAPS_MAX_WAYPOINTS,
  distanceKm,
  formatKm,
  googleMapsRouteUrls,
  googleMapsTripUrls,
  isShortMapsLink,
  parseLatLng,
  planRoute,
} from "../lib/route.ts"

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

// Alcorta (Santa Fe) aprox.; 0.009° de latitud ≈ 1 km.
const BASE = { lat: -33.5333, lng: -61.1222 }
const at = (kmNorth, kmEast = 0) => ({
  lat: BASE.lat + kmNorth / 111.195,
  lng: BASE.lng + kmEast / (111.195 * Math.cos((BASE.lat * Math.PI) / 180)),
})
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

// PRNG determinístico (mulberry32) para que las verificaciones den siempre lo mismo.
function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const randomPoints = (rand, count) => Array.from({ length: count }, () => at(rand() * 6 - 3, rand() * 6 - 3))

function routeKm(start, stops, end, order) {
  let km = 0
  let prev = start
  for (const i of order) {
    km += distanceKm(prev, stops[i])
    prev = stops[i]
  }
  return end ? km + distanceKm(prev, end) : km
}

function bruteForceKm(start, stops, end) {
  let best = Infinity
  const permute = (rest, order) => {
    if (rest.length === 0) {
      best = Math.min(best, routeKm(start, stops, end, order))
      return
    }
    for (let i = 0; i < rest.length; i++) permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...order, rest[i]])
  }
  permute([...stops.keys()], [])
  return best
}

const isPermutation = (order, count) =>
  order.length === count && [...order].sort((a, b) => a - b).every((v, i) => v === i)

// ---- Distancias ----

check("1° de latitud ≈ 111,2 km", () => {
  assert.ok(near(distanceKm({ lat: 0, lng: 0.5 }, { lat: 1, lng: 0.5 }), 111.195, 0.01))
})
check("mismo punto: 0 km", () => assert.equal(distanceKm(BASE, BASE), 0))

// ---- Orden de visita ----

check("sin paradas: ida y vuelta directa o nada", () => {
  const r = planRoute(at(0), [], at(2))
  assert.deepEqual(r.order, [])
  assert.ok(near(r.totalKm, 2, 0.01))
  assert.equal(planRoute(at(0), [], null).totalKm, 0)
})

check("en línea: visita de la más cercana a la más lejana y termina en la llegada", () => {
  const stops = [at(3), at(1), at(2)]
  const r = planRoute(at(0), stops, at(4))
  assert.deepEqual(r.order, [1, 2, 0])
  assert.ok(near(r.totalKm, 4, 0.01))
})

check("sin vuelta: termina en la última entrega (la más lejana)", () => {
  const r = planRoute(at(0), [at(5), at(1), at(3)], null)
  assert.deepEqual(r.order, [1, 2, 0])
  assert.equal(r.legsKm.length, 3)
  assert.ok(near(r.totalKm, 5, 0.01))
})

check("sale del depósito y vuelve al local: las paradas del camino quedan en orden", () => {
  // Depósito al norte, local al sur: las entregas intermedias se hacen bajando.
  const r = planRoute(at(4), [at(1), at(3), at(2)], at(0))
  assert.deepEqual(r.order, [1, 2, 0])
})

check("dos pedidos en la misma dirección quedan seguidos", () => {
  const stops = [at(1, 1), at(-2, 0), at(1, 1), at(3, -1)]
  const { order } = planRoute(at(0), stops, at(0))
  const a = order.indexOf(0)
  const b = order.indexOf(2)
  assert.equal(Math.abs(a - b), 1)
})

check("tramos: suman el total y hay uno más que paradas si vuelve", () => {
  const stops = randomPoints(rng(7), 6)
  const r = planRoute(at(0), stops, at(0))
  assert.equal(r.legsKm.length, stops.length + 1)
  assert.ok(near(r.legsKm.reduce((a, b) => a + b, 0), r.totalKm))
  assert.ok(near(routeKm(at(0), stops, at(0), r.order), r.totalKm))
})

check(`hasta ${EXACT_MAX_STOPS} paradas el orden es el óptimo (contra fuerza bruta)`, () => {
  const rand = rng(42)
  for (let count = 1; count <= 8; count++) {
    for (let t = 0; t < 6; t++) {
      const start = randomPoints(rand, 1)[0]
      const stops = randomPoints(rand, count)
      for (const end of [start, randomPoints(rand, 1)[0], null]) {
        const r = planRoute(start, stops, end)
        assert.ok(isPermutation(r.order, count))
        assert.ok(near(r.totalKm, bruteForceKm(start, stops, end)), `n=${count} t=${t}`)
      }
    }
  }
})

check("método aproximado (más de 12 paradas): cerca del óptimo", () => {
  const rand = rng(1234)
  let worst = 0
  let sumGap = 0
  let cases = 0
  for (let count = 8; count <= 10; count++) {
    for (let t = 0; t < 6; t++) {
      const start = randomPoints(rand, 1)[0]
      const stops = randomPoints(rand, count)
      for (const end of [start, null]) {
        const approx = planRoute(start, stops, end, { exactMaxStops: 0 })
        assert.ok(isPermutation(approx.order, count))
        const gap = approx.totalKm / bruteForceKm(start, stops, end) - 1
        worst = Math.max(worst, gap)
        sumGap += gap
        cases++
      }
    }
  }
  assert.ok(sumGap / cases < 0.005, `desvío promedio ${(100 * sumGap) / cases}%`)
  assert.ok(worst < 0.05, `peor desvío ${100 * worst}%`)
})

check("40 paradas: resuelve rápido y no es peor que ir siempre a la más cercana", () => {
  const rand = rng(99)
  const start = at(0)
  const stops = randomPoints(rand, 40)
  const t0 = performance.now()
  const r = planRoute(start, stops, start)
  assert.ok(performance.now() - t0 < 2000)
  assert.ok(isPermutation(r.order, 40))
  // Vecino más cercano puro.
  const pending = new Set(stops.keys())
  const greedy = []
  let cur = start
  while (pending.size) {
    let best = -1
    for (const i of pending) if (best < 0 || distanceKm(cur, stops[i]) < distanceKm(cur, stops[best])) best = i
    greedy.push(best)
    pending.delete(best)
    cur = stops[best]
  }
  assert.ok(r.totalKm <= routeKm(start, stops, start, greedy) + 1e-9)
})

// Matriz de km sobre [salida, ...paradas, llegada]: línea recta × 1,2 más un recargo en algunos sentidos
// (manos únicas que obligan a dar la vuelta a la manzana).
function oneWayMatrix(rand, pts) {
  return pts.map((a, i) =>
    pts.map((b, j) => (i === j ? 0 : distanceKm(a, b) * 1.2 + (rand() < 0.4 ? rand() * 0.8 : 0))),
  )
}
function matrixKm(M, order, hasEnd) {
  let km = 0
  let prev = 0
  for (const i of order) {
    km += M[prev][i + 1]
    prev = i + 1
  }
  return hasEnd ? km + M[prev][M.length - 1] : km
}
function bruteForceMatrix(M, count, hasEnd) {
  let best = Infinity
  const permute = (rest, order) => {
    if (rest.length === 0) {
      best = Math.min(best, matrixKm(M, order, hasEnd))
      return
    }
    for (let i = 0; i < rest.length; i++) permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...order, rest[i]])
  }
  permute([...Array(count).keys()], [])
  return best
}

check("calles de mano única (ida ≠ vuelta): exacto y aproximado contra fuerza bruta", () => {
  const rand = rng(77)
  let worst = 0
  for (let count = 3; count <= 8; count++) {
    for (let t = 0; t < 5; t++) {
      for (const hasEnd of [true, false]) {
        const pts = randomPoints(rand, count + (hasEnd ? 2 : 1))
        const M = oneWayMatrix(rand, pts)
        const stops = pts.slice(1, count + 1)
        const end = hasEnd ? pts[count + 1] : null
        const best = bruteForceMatrix(M, count, hasEnd)
        const exact = planRoute(pts[0], stops, end, { distances: M })
        assert.ok(near(exact.totalKm, best), `exacto n=${count}`)
        assert.ok(near(matrixKm(M, exact.order, hasEnd), exact.totalKm))
        const approx = planRoute(pts[0], stops, end, { distances: M, exactMaxStops: 0 })
        assert.ok(isPermutation(approx.order, count))
        worst = Math.max(worst, approx.totalKm / best - 1)
      }
    }
  }
  assert.ok(worst < 0.05, `peor desvío ${100 * worst}%`)
})

check("mano única: entrega primero lo que queda a favor de la mano", () => {
  // Salida en 0, paradas a 1 y 2 km. Ir de la de 2 km a la de 1 km obliga a rodear (5 km).
  const pts = [at(0), at(1), at(2)]
  const M = [
    [0, 1, 2],
    [1, 0, 1],
    [2, 5, 0],
  ]
  const r = planRoute(pts[0], pts.slice(1), null, { distances: M })
  assert.deepEqual(r.order, [0, 1])
  assert.ok(near(r.totalKm, 2))
})

check("sin dato por calle (null) usa la línea recta en ese tramo", () => {
  const pts = [at(0), at(1), at(3)]
  const M = [
    [0, null, null],
    [null, 0, 7],
    [null, 7, 0],
  ]
  const r = planRoute(pts[0], pts.slice(1), null, { distances: M })
  assert.deepEqual(r.order, [0, 1])
  assert.ok(near(r.legsKm[0], distanceKm(pts[0], pts[1])))
  assert.equal(r.legsKm[1], 7)
})

check("determinístico: mismos datos, mismo orden", () => {
  const stops = randomPoints(rng(5), 20)
  assert.deepEqual(planRoute(at(0), stops, at(1)).order, planRoute(at(0), stops, at(1)).order)
})

// ---- Coordenadas pegadas por el admin ----

const expectPoint = (text, lat, lng) => {
  const p = parseLatLng(text)
  assert.ok(p, `no leyó: ${text}`)
  assert.ok(near(p.lat, lat, 1e-5) && near(p.lng, lng, 1e-5), `${text} -> ${p.lat},${p.lng}`)
}

check("coordenadas decimales (copiadas de Google Maps)", () => {
  expectPoint("-33.5321, -61.1234", -33.5321, -61.1234)
  expectPoint("  (-33.532100 -61.123400) ", -33.5321, -61.1234)
  expectPoint("-33.532100;-61.123400", -33.5321, -61.1234)
})

check("grados, minutos y segundos (S/W y S/O)", () => {
  expectPoint(`33°32'05.6"S 61°07'24.4"W`, -33.534889, -61.123444)
  expectPoint(`33°32'05.6"S, 61°07'24.4"O`, -33.534889, -61.123444)
})

check("links largos de Google Maps y OpenStreetMap", () => {
  expectPoint(
    "https://www.google.com/maps/place/Kiosco/@-33.5300,-61.1200,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-33.5321!4d-61.1234",
    -33.5321,
    -61.1234,
  )
  expectPoint("https://www.google.com/maps/search/?api=1&query=-33.5321%2C-61.1234", -33.5321, -61.1234)
  expectPoint("https://www.google.com/maps/search/-33.532100,+-61.123400?entry=tts", -33.5321, -61.1234)
  expectPoint("https://maps.google.com/?q=-33.5321,-61.1234", -33.5321, -61.1234)
  expectPoint(
    "https://www.openstreetmap.org/?mlat=-33.5321&mlon=-61.1234#map=17/-33.5300/-61.1200",
    -33.5321,
    -61.1234,
  )
  expectPoint("https://www.openstreetmap.org/#map=18/-33.53210/-61.12340", -33.5321, -61.1234)
})

check("texto que no son coordenadas", () => {
  for (const text of ["Belgrano 450", "Ruta 90 km 3.5, 2", "0.000000, 0.000000", "", "-95.1234, 10.1234", "12, 34"]) {
    assert.equal(parseLatLng(text), null, text)
  }
})

check("links cortos de Google Maps", () => {
  assert.ok(isShortMapsLink("https://maps.app.goo.gl/AbC123xyz"))
  assert.ok(isShortMapsLink("https://goo.gl/maps/AbC123"))
  assert.ok(!isShortMapsLink("https://example.com/maps.app.goo.gl/x"))
  assert.ok(!isShortMapsLink("Belgrano 450"))
})

// ---- Links del recorrido ----

check(`Google Maps: hasta ${MAPS_MAX_WAYPOINTS} paradas intermedias por link`, () => {
  const pts = (k) => Array.from({ length: k }, (_, i) => at(i))
  assert.deepEqual(googleMapsRouteUrls(pts(1)), [])
  const [direct] = googleMapsRouteUrls(pts(2))
  assert.ok(!new URL(direct).searchParams.has("waypoints"))
  const one = googleMapsRouteUrls(pts(11))
  assert.equal(one.length, 1)
  assert.equal(new URL(one[0]).searchParams.get("waypoints").split("|").length, 9)
  const two = googleMapsRouteUrls(pts(12))
  assert.equal(two.length, 2)
  // El segundo tramo arranca donde terminó el primero.
  assert.equal(new URL(two[1]).searchParams.get("origin"), new URL(two[0]).searchParams.get("destination"))
  assert.equal(googleMapsRouteUrls(pts(21)).length, 2)
  assert.equal(googleMapsRouteUrls(pts(22)).length, 3)
})

check("la vuelta final entra en el link sólo si no suma otro tramo", () => {
  const stops = (k) => Array.from({ length: k }, (_, i) => at(i + 1))
  const start = at(0)
  const end = at(-1)
  const dest = (url) => new URL(url).searchParams.get("destination")
  const fmt = (p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
  // 9 paradas + vuelta = 11 puntos: un link que termina en la llegada.
  const nine = googleMapsTripUrls(start, stops(9), end)
  assert.equal(nine.length, 1)
  assert.equal(dest(nine[0]), fmt(end))
  // 10 paradas: con la vuelta serían 2 links; sin ella, 1 que termina en la última entrega.
  const ten = googleMapsTripUrls(start, stops(10), end)
  assert.equal(ten.length, 1)
  assert.equal(dest(ten[0]), fmt(stops(10)[9]))
  // 20 paradas (un día completo en una franja): 2 links en vez de 3.
  assert.equal(googleMapsTripUrls(start, stops(20), end).length, 2)
  // 18 paradas: la vuelta entra sin sumar tramos.
  const eighteen = googleMapsTripUrls(start, stops(18), end)
  assert.equal(eighteen.length, 2)
  assert.equal(dest(eighteen[1]), fmt(end))
  // Sin vuelta configurada ("última entrega").
  assert.equal(dest(googleMapsTripUrls(start, stops(3), null)[0]), fmt(stops(3)[2]))
})

check("formato de distancias", () => {
  assert.equal(formatKm(0.85), "850 m")
  assert.equal(formatKm(3.44), "3,4 km")
  assert.equal(formatKm(12), "12 km")
})

console.log(`check-route: ${n} verificaciones OK`)
