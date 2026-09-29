// Verificaciones del mapa de calles (lib/street-graph.ts). Uso: node scripts/check-streets.mjs
import assert from "node:assert/strict"
import { buildStreetGraph, directionOf, isDrivable, streetDistances, SNAP_MAX_KM } from "../lib/street-graph.ts"

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
const near = (a, b, tol) => Math.abs(a - b) <= tol

// Barrio inventado de 3 x 3 esquinas, cuadras de ~100 m:
//
//   1 --- 2 --- 3      fila 0 (norte)
//   |     |     |
//   4 >>> 5 >>> 6      fila 1: MANO ÚNICA de oeste a este
//   |     |     |
//   7 --- 8 --- 9      fila 2 (sur)
const LAT0 = -33.53
const LNG0 = -61.12
const DLAT = 100 / 110_574 // 100 m
const DLNG = 100 / (111_320 * Math.cos((LAT0 * Math.PI) / 180))
const S = 0.1 // km por cuadra
const corner = (row, col) => ({ lat: LAT0 - row * DLAT, lng: LNG0 + col * DLNG })
const node = (id, row, col) => ({ type: "node", id, lat: corner(row, col).lat, lon: corner(row, col).lng })
const way = (id, nodes, tags) => ({ type: "way", id, nodes, tags: { highway: "residential", ...tags } })
const mid = (a, b) => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 })

const nodes = [
  node(1, 0, 0), node(2, 0, 1), node(3, 0, 2),
  node(4, 1, 0), node(5, 1, 1), node(6, 1, 2),
  node(7, 2, 0), node(8, 2, 1), node(9, 2, 2),
]
const barrio = [
  ...nodes,
  way(10, [1, 2, 3]),
  way(11, [4, 5, 6], { oneway: "yes" }),
  way(12, [7, 8, 9]),
  way(13, [1, 4, 7]),
  way(14, [2, 5, 8]),
  way(15, [3, 6, 9]),
  way(16, [1, 5], { highway: "footway" }), // vereda en diagonal: el auto no pasa
]

// ---- Etiquetas ----

check("sentido de circulación según las etiquetas", () => {
  assert.equal(directionOf({ highway: "residential" }), "both")
  assert.equal(directionOf({ oneway: "yes" }), "forward")
  assert.equal(directionOf({ oneway: "1" }), "forward")
  assert.equal(directionOf({ oneway: "-1" }), "backward")
  assert.equal(directionOf({ oneway: "no", junction: "roundabout" }), "both")
  assert.equal(directionOf({ junction: "roundabout" }), "forward")
  assert.equal(directionOf({ highway: "motorway" }), "forward")
})

check("sólo calles por las que anda un auto", () => {
  assert.ok(isDrivable({ highway: "residential" }))
  assert.ok(isDrivable({ highway: "service" }))
  assert.ok(!isDrivable({ highway: "footway" }))
  assert.ok(!isDrivable({ highway: "cycleway" }))
  assert.ok(!isDrivable({ highway: "residential", access: "private" }))
  assert.ok(!isDrivable({ highway: "residential", motor_vehicle: "no" }))
  assert.ok(!isDrivable({ building: "yes" }))
})

check("arma el grafo: 6 calles (1 de mano única), sin la vereda", () => {
  const { graph, ways, oneWays } = buildStreetGraph(barrio)
  assert.equal(ways, 6)
  assert.equal(oneWays, 1)
  assert.equal(graph.nodes.length, 9)
  // 5 calles doble mano x 2 cuadras x 2 sentidos + 1 de mano única x 2 cuadras.
  assert.equal(graph.edges.length, 22)
})

// ---- Distancias ----

const { graph } = buildStreetGraph(barrio)
const oeste = mid(corner(1, 0), corner(1, 1)) // mitad de la cuadra 4-5 (mano única)
const este = mid(corner(1, 1), corner(1, 2)) // mitad de la cuadra 5-6

check("a favor de la mano: una cuadra; en contra: hay que rodear (5 cuadras)", () => {
  const [[, ida], [vuelta]] = streetDistances(graph, [oeste, este])
  assert.ok(near(ida, S, 0.003), `ida ${ida}`)
  assert.ok(near(vuelta, 5 * S, 0.01), `vuelta ${vuelta}`)
})

check("contramano (oneway=-1) invierte el sentido", () => {
  const invertido = barrio.map((el) => (el.id === 11 ? way(11, [4, 5, 6], { oneway: "-1" }) : el))
  const [[, ida], [vuelta]] = streetDistances(buildStreetGraph(invertido).graph, [oeste, este])
  assert.ok(near(ida, 5 * S, 0.01), `ida ${ida}`)
  assert.ok(near(vuelta, S, 0.003), `vuelta ${vuelta}`)
})

check("dos entregas en la misma cuadra de doble mano: se va directo", () => {
  const a = { lat: corner(0, 0).lat, lng: LNG0 + 0.25 * DLNG }
  const b = { lat: corner(0, 0).lat, lng: LNG0 + 0.75 * DLNG }
  const [[, ab], [ba]] = streetDistances(graph, [a, b])
  assert.ok(near(ab, S / 2, 0.003) && near(ba, S / 2, 0.003), `${ab} ${ba}`)
})

check("una casa a media cuadra se ubica sobre la calle más cercana", () => {
  // 20 m al norte de la mitad de la cuadra 1-2.
  const casa = { lat: corner(0, 0).lat + 20 / 110_574, lng: LNG0 + 0.5 * DLNG }
  const [[, d]] = streetDistances(graph, [casa, corner(0, 1)])
  assert.ok(near(d, S / 2, 0.003), `${d}`)
})

check(`más de ${SNAP_MAX_KM * 1000} m de cualquier calle: no se mide por calle (null)`, () => {
  const lejos = { lat: LAT0 + 0.01, lng: LNG0 } // ~1 km al norte
  const m = streetDistances(graph, [corner(0, 0), lejos])
  assert.equal(m[0][1], null)
  assert.equal(m[1][0], null)
  assert.equal(m[1][1], null)
  assert.equal(m[0][0], 0)
})

check("calle sin salida de mano única: se llega pero no se puede volver (null)", () => {
  const conPasaje = [
    ...barrio,
    { type: "node", id: 20, lat: corner(2, 2).lat - DLAT, lon: corner(2, 2).lng },
    way(21, [9, 20], { oneway: "yes" }),
  ]
  const pasaje = { lat: corner(2, 2).lat - DLAT / 2, lng: corner(2, 2).lng }
  const [[, entrar], [salir]] = streetDistances(buildStreetGraph(conPasaje).graph, [corner(0, 0), pasaje])
  assert.ok(entrar !== null && near(entrar, 4.5 * S, 0.01), `entrar ${entrar}`)
  assert.equal(salir, null)
})

console.log(`check-streets: ${n} verificaciones OK`)
