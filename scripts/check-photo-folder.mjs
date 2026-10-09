// Verificaciones del cruce carpeta de fotos ↔ catálogo (lib/photo-folder-match.ts).
// Uso: node scripts/check-photo-folder.mjs
import assert from "node:assert/strict"
import { compareNames, matchPhotoFile } from "../lib/photo-folder-match.ts"

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
const same = (file, product) => {
  const { missing, extra } = compareNames(file, product)
  assert.deepEqual([missing, extra], [[], []], `${file} = ${product}`)
}
const differ = (file, product) => {
  const { missing, extra } = compareNames(file, product)
  assert.ok(missing.length + extra.length > 0, `${file} ≠ ${product}`)
}

// Nombres reales de la carpeta del dueño contra los de la lista.
check("abreviaturas, C/ y S/, tildes y medidas escritas distinto", () => {
  same("COCA COLA RETORNABLE VIDRIO 1.25L", "COCA COLA CAJON RETORN 1.25L X8")
  same("MANI SIN PIEL FRITO SALA 1000G", "MANI S/PIEL FRITO SALA  x 1000G UNIDAD")
  same("GALL TRIO PEPAS CON MEMBRILLO 320GR", "GALL TRIO PEPAS C/MEMBRILLO 320GR UNIDAD")
  same("CASA BOHER VINO CAB.FRANC 750ML", "CASA BOHER VINO CAB FRANC 750ML UNIDAD")
  same("ESTANCIA MENDOZA BLANCO SECO 750ML", "ESTANCIA MENDOZA BLANCO SECO 3/4 UNIDAD")
  same("CHIZITOS QUESO 700G COP´S", "CHIZITO QUESO x 700G UNIDAD")
  same("PAPAS FRITAS 400GR", "PAPAS FRITAS x 400 g UNIDAD")
  same("ALAMOS MALBEC 750ML", "ALAMOS MALBEC 750 UNIDAD")
  same("LA HOJA MATE COCIDO 25 SAQ", "LA HOJA MATECOCIDO 25SAQ UNIDAD")
})

check("errores de tipeo de una letra", () => {
  same("MARIA CODRONIU BRUT 750ML", "MARIA CODORNIU BRUT VINO 750ML UNIDAD")
  same("BAGGIO MULTIDRUTA X200ML", "BAGGIO MULTIFRUTA X200ML CAJA X18")
  same("FEDERICO DE ALVEAR ECTRA DULCE 750ML", "FEDERICO DE ALVEAR EXTRA DULCE UNIDAD")
})

check("la cantidad del pack no cuenta; la del contenido sí", () => {
  same("BON O BON BOMBONES AGUILA 15G X 18U", "BON O BON BOMBONES AGUILA 15GR X18U")
  same("7UP LATA 354ML", "7UP LATA 354ML PACK X 6")
  differ("MATE COCIDO 25U PLAYADITO", "MATECOCIDO PLAYADITO 50U")
})

check("otra variedad, otro tamaño u otro envase no es el mismo producto", () => {
  differ("MOSTACHOL RAYADO MAROLIO 500G", "MOSTACHOL LISO MAROLIO 500G")
  differ("NATURA MAYONESA 500GR", "MAYONESA NATURA 1 K UNIDAD")
  differ("GANCIA LATA CON ALCOHOL 473CC", "GANCIA CERO LATA 473CC X6")
  differ("COCA COLA RETORNABLE VIDRIO 1.25L", "COCA COLA DESCART 1.25L")
  differ("OLD SMUGGLER 750ML WHISKY", "OLD SMUGGLER WHISKY 1L")
  differ("ALMA MORA BLANCO 750ML", "ALMA MORA MALBEC 750ML")
})

const catalog = [
  { id: 1, name: "CORONA CERVEZA 710ML UNIDAD", groupKey: "corona cerveza 710ml", packSize: 1 },
  { id: 2, name: "CORONA 710ML X12", groupKey: "corona cerveza 710ml", packSize: 12 },
  { id: 3, name: "CORONA 710CC FRIA", groupKey: "corona fria 710ml", packSize: 1 },
  { id: 4, name: "MOSTACHOL LISO MAROLIO 500G", groupKey: "mostachol liso marolio 500g", packSize: 1 },
  { id: 5, name: "BRAHMA LATA 473ML PACK X6", groupKey: "brahma lata 473ml", packSize: 6 },
]

check("exacta: la foto va a la presentación más chica de cada artículo que coincide (también la FRÍA)", () => {
  const m = matchPhotoFile("CORONA 710CC.jpg", catalog)
  assert.equal(m.kind, "exacta")
  assert.deepEqual(m.articles, ["corona cerveza 710ml", "corona fria 710ml"])
  assert.deepEqual(m.productIds, [1, 3])
})

check("dudosa: queda pendiente en el más parecido", () => {
  const m = matchPhotoFile("MOSTACHOL RAYADO MAROLIO 500G.jpg", catalog)
  assert.equal(m.kind, "dudosa")
  assert.deepEqual(m.productIds, [4])
})

check("sin producto: nada parecido en la lista", () => {
  const m = matchPhotoFile("SPRITE LIMA LIMON 2.25L.png", catalog)
  assert.equal(m.kind, "sin-producto")
  assert.deepEqual(m.productIds, [])
})

console.log(`check-photo-folder: ${n} verificaciones OK`)
