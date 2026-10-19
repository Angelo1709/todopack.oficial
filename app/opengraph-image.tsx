import { ImageResponse } from "next/og"
import { LogoBadge, readHeadingFont, readLogo } from "@/lib/logo-badge"

// Vista previa al compartir el link (WhatsApp, Facebook, Google): se genera en el build.
export const alt = "TodoPack Alcorta — Bebidas, almacén y limpieza con precio mayorista"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OpengraphImage() {
  const [logo, rubik] = await Promise.all([readLogo(), readHeadingFont()])
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: "0 72px",
          background: "#1c1917",
          color: "#fafaf9",
        }}
      >
        <LogoBadge src={logo} size={392} ring={8} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: "#f59e0b" }}>
            Distribuidora en Alcorta
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Rubik", fontSize: 62, lineHeight: 1.1, marginTop: 16 }}>
            Bebidas, almacén y limpieza con&nbsp;<span style={{ color: "#f59e0b" }}>precio mayorista</span>
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.3, marginTop: 28, color: "#d6d3d1" }}>
            Pedí online y te lo llevamos. Ventas por mayor y menor.
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Rubik", data: rubik, weight: 700, style: "normal" }] },
  )
}
