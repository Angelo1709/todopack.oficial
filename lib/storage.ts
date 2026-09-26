import "server-only"
import { put } from "@vercel/blob"

/**
 * Devuelve la URL a guardar para una imagen encontrada en internet.
 * Por defecto se guarda el link original; si hay BLOB_READ_WRITE_TOKEN se copia a Vercel Blob.
 */
export async function persistImage(sourceUrl: string, keyHint: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return sourceUrl

  const response = await fetch(sourceUrl, { cache: "no-store" })
  const contentType = response.headers.get("content-type") ?? ""
  if (!response.ok || !contentType.startsWith("image/")) {
    throw new Error("La URL no devolvió una imagen")
  }
  const blob = await put(`products/${keyHint.slice(0, 80)}`, await response.arrayBuffer(), {
    access: "public",
    contentType,
    addRandomSuffix: true,
  })
  return blob.url
}
