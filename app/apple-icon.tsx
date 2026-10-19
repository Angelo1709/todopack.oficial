import { ImageResponse } from "next/og"
import { LogoBadge, readLogo } from "@/lib/logo-badge"

// Ícono al agregar la tienda a la pantalla de inicio del iPhone (iOS lo recorta con esquinas redondeadas).
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1c1917" }}>
        <LogoBadge src={await readLogo()} size={156} ring={4} />
      </div>
    ),
    size,
  )
}
