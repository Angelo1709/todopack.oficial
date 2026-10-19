import { NextResponse, type NextRequest } from "next/server"
import { getSiteUrl } from "@/lib/site"

// Dominio principal: quien entra por la dirección de Railway (…up.railway.app) o con "www."
// pasa al dominio propio, así Google ve una sola web y no dos copias. Sólo páginas (GET/HEAD):
// las API (sincronización de stock de Gestión, healthcheck, portal de fotos) y las server
// actions siguen respondiendo en cualquier dirección.
export function proxy(request: NextRequest) {
  const site = getSiteUrl()
  if (!site || (request.method !== "GET" && request.method !== "HEAD")) return

  const main = new URL(site)
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase()
  if (host === main.host) return
  if (!host.endsWith(".up.railway.app") && host !== `www.${main.host}`) return

  return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, main), 301)
}

export const config = {
  matcher: ["/((?!api|ingest|_next/static|_next/image).*)"],
}
