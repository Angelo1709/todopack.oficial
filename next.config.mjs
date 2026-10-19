/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Fotos propias (portal de fotos, guardadas en la base) e imágenes de public/: Next las achica al
    // tamaño de cada pantalla y las pasa a WebP. Las URLs externas se muestran tal cual (lib/images.ts).
    localPatterns: [
      { pathname: "/api/fotos-productos/**", search: "" },
      { pathname: "/categories/**", search: "" },
      { pathname: "/logo-todopack.jpg", search: "" },
    ],
    formats: ["image/webp"],
    qualities: [75],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [64, 96, 128, 256, 384],
    // El contenido de cada foto nunca cambia (una foto nueva tiene otro id): se puede guardar 31 días.
    minimumCacheTTL: 2678400,
  },
}

export default nextConfig
