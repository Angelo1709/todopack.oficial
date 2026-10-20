// Región de la cuenta de PostHog ("us" o "eu"), la misma que en instrumentation-client.ts.
const posthogRegion = process.env.NEXT_PUBLIC_POSTHOG_REGION === "eu" ? "eu" : "us"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy de PostHog: el navegador manda las métricas a /ingest (nuestro dominio) y Next las reenvía.
  // Los de static/array van antes que el comodín.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `https://${posthogRegion}-assets.i.posthog.com/static/:path*` },
      { source: "/ingest/array/:path*", destination: `https://${posthogRegion}-assets.i.posthog.com/array/:path*` },
      { source: "/ingest/:path*", destination: `https://${posthogRegion}.i.posthog.com/:path*` },
    ]
  },
  // La API de PostHog usa barras finales (/e/): sin esto Next las redirige y se pierden eventos.
  skipTrailingSlashRedirect: true,
  images: {
    // Fotos propias (portal de fotos, guardadas en la base) e imágenes de public/: Next las achica al
    // tamaño de cada pantalla y las pasa a WebP. Las URLs externas se muestran tal cual (lib/images.ts).
    localPatterns: [
      { pathname: "/api/fotos-productos/**", search: "" },
      // Banners de la portada (Admin → Promociones), también guardados en la base e inmutables por id.
      { pathname: "/api/banners/**", search: "" },
      { pathname: "/categories/**", search: "" },
      { pathname: "/logo-todopack.jpg", search: "" },
    ],
    formats: ["image/webp"],
    qualities: [75],
    // 1920: banners de la portada a todo el ancho en pantallas grandes.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 384],
    // El contenido de cada foto nunca cambia (una foto nueva tiene otro id): se puede guardar 31 días.
    minimumCacheTTL: 2678400,
  },
}

export default nextConfig
