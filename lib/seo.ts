import "server-only"
import { getRouteSettings, getSettings } from "@/lib/settings"
import { parseLatLng } from "@/lib/route"
import { normalizeWhatsAppNumber } from "@/lib/whatsapp"
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/site"

// Datos del negocio para Google (schema.org, JSON-LD): nombre, web, logo, WhatsApp y la
// dirección del local de /admin/configuracion. Lo que no está cargado no se publica.
export async function getBusinessJsonLd() {
  const [settings, route] = await Promise.all([getSettings(), getRouteSettings()])
  const site = getSiteUrl() ?? "http://localhost:3000"
  const phone = normalizeWhatsAppNumber(settings.whatsappNumber)
  const address = route.localAddress.trim()
  const location = parseLatLng(route.localLocation)
  const [locality, region] = route.routeCity.split(",").map((part) => part.trim())

  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: site,
    logo: `${site}/logo-todopack.jpg`,
    image: `${site}/opengraph-image`,
    ...(phone ? { telephone: `+${phone}` } : {}),
    ...(address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: address,
            ...(locality ? { addressLocality: locality } : {}),
            ...(region ? { addressRegion: region } : {}),
            addressCountry: "AR",
          },
        }
      : {}),
    ...(location ? { geo: { "@type": "GeoCoordinates", latitude: location.lat, longitude: location.lng } } : {}),
    ...(route.routeCity.trim() ? { areaServed: route.routeCity.trim() } : {}),
    currenciesAccepted: "ARS",
    paymentAccepted: "Efectivo, Transferencia bancaria",
  }
}

// JSON-LD como texto seguro dentro de <script>: los datos los carga el admin, nunca HTML.
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
