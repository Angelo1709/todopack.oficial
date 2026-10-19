import type { MetadataRoute } from "next"
import { getSiteUrl } from "@/lib/site"

// Se arma al pedirlo: el dominio sale de las variables del servidor.
export const dynamic = "force-dynamic"

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl()
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Panel, compra, cuentas, pedidos privados y métricas: nada para mostrar en Google.
      disallow: ["/admin", "/checkout", "/mis-pedidos", "/pedido/", "/sign-in", "/sign-up", "/ingest/"],
    },
    ...(site ? { sitemap: `${site}/sitemap.xml` } : {}),
  }
}
