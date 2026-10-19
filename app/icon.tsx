import { ImageResponse } from "next/og"
import { LogoBadge, readLogo } from "@/lib/logo-badge"

// Ícono de la pestaña y de los resultados de Google (múltiplo de 48 px, como pide Google).
export const size = { width: 96, height: 96 }
export const contentType = "image/png"

export default async function Icon() {
  return new ImageResponse(<LogoBadge src={await readLogo()} size={size.width} />, size)
}
