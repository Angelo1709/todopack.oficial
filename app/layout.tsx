import type { Metadata, Viewport } from 'next'
import { Nunito_Sans, Rubik } from 'next/font/google'
import { CartProvider } from '@/components/cart/cart-provider'
import { Toaster } from '@/components/ui/sonner'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, getSiteUrl } from '@/lib/site'
import './globals.css'

// Tipografía de e-commerce (ui-ux-pro-max): Rubik para títulos y precios, Nunito Sans para el texto.
const body = Nunito_Sans({ subsets: ['latin'], variable: '--font-body' })
const heading = Rubik({ subsets: ['latin'], variable: '--font-heading' })

export const metadata: Metadata = {
  // Base de los links absolutos (vista previa al compartir, canonical): el dominio principal.
  metadataBase: new URL(getSiteUrl() ?? 'http://localhost:3000'),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // Vista previa al compartir el link (WhatsApp, Facebook): la imagen sale de app/opengraph-image.tsx.
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  themeColor: '#1c1917',
  // Para respetar el notch y la barra de gestos (env(safe-area-inset-*)) en las barras fijas.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-AR">
      <body className={`${body.variable} ${heading.variable} font-sans antialiased`}>
        <CartProvider>{children}</CartProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  )
}
