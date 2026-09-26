/** Solo permite volver a rutas internas ("/mis-pedidos"), nunca a otro dominio ("//x.com", "https://..."). */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  const path = Array.isArray(value) ? value[0] : value
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return fallback
  }
  return path
}
