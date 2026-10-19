// Dominio principal del sitio (sin "/" final): BETTER_AUTH_URL o, en Railway, el dominio que asigna
// la plataforma. Lo usan el login, los links que se comparten, el mapa del sitio y la redirección
// de la dirección de Railway al dominio propio (proxy.ts). Sin base de datos: lo importa el proxy.
export function getSiteUrl(): string | undefined {
  const url =
    process.env.BETTER_AUTH_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined)
  return url?.replace(/\/+$/, "")
}

export const SITE_NAME = "TodoPack Alcorta"
export const SITE_TITLE = "TodoPack Alcorta — Distribuidora"
export const SITE_DESCRIPTION =
  "Distribuidora TodoPack Alcorta. Bebidas, almacén, limpieza y más. Ventas por mayor y menor con entrega a domicilio."
