import { readFile } from "node:fs/promises"
import { join } from "node:path"

// Para las imágenes generadas con next/og (vista previa al compartir, ícono de la pestaña).
// public/logo-todopack.jpg es una captura de 1200×1056 con fondo y un botón de "me gusta" en la
// esquina: se recorta un círculo alrededor del centro de la tapita que deja afuera el botón.
const LOGO = { width: 1200, height: 1056, centerX: 600, centerY: 495, radius: 340 }

export async function readLogo() {
  const data = await readFile(join(process.cwd(), "public/logo-todopack.jpg"))
  return `data:image/jpeg;base64,${data.toString("base64")}`
}

export function readHeadingFont() {
  return readFile(join(process.cwd(), "assets/fonts/Rubik-Bold.ttf"))
}

// ring: borde ámbar alrededor (como el logo del header), en px; tapa el filo del recorte.
export function LogoBadge({ src, size, ring = 0 }: { src: string; size: number; ring?: number }) {
  const scale = size / (LOGO.radius * 2)
  const badge = (
    <div style={{ display: "flex", position: "relative", width: size, height: size, borderRadius: "50%", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og sólo dibuja <img> */}
      <img
        alt=""
        src={src}
        width={LOGO.width * scale}
        height={LOGO.height * scale}
        style={{
          position: "absolute",
          left: -(LOGO.centerX - LOGO.radius) * scale,
          top: -(LOGO.centerY - LOGO.radius) * scale,
        }}
      />
    </div>
  )
  if (!ring) return badge
  return (
    <div style={{ display: "flex", borderRadius: "50%", border: `${ring}px solid rgba(245, 158, 11, 0.55)` }}>
      {badge}
    </div>
  )
}
