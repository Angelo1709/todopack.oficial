/**
 * true si Next puede optimizar la imagen: tiene que coincidir con images.localPatterns de next.config.mjs.
 * Las URLs externas (de otros sitios) se muestran sin optimizar para no depender de qué dominios usa cada foto.
 */
export function isOptimizableImage(src: string): boolean {
  return src.startsWith("/api/fotos-productos/") || src.startsWith("/categories/") || src === "/logo-todopack.png"
}
