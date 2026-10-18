import type { Metadata, Viewport } from 'next'
import { Nunito_Sans, Rubik } from 'next/font/google'
import { CartProvider } from '@/components/cart/cart-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// Tipografía de e-commerce (ui-ux-pro-max): Rubik para títulos y precios, Nunito Sans para el texto.
const body = Nunito_Sans({ subsets: ['latin'], variable: '--font-body' })
const heading = Rubik({ subsets: ['latin'], variable: '--font-heading' })

export const metadata: Metadata = {
  title: 'TodoPack Alcorta — Distribuidora',
  description:
    'Distribuidora TodoPack Alcorta. Bebidas, almacén, limpieza y más. Ventas por mayor y menor con entrega a domicilio.',
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
    <html lang="es">
      <body className={`${body.variable} ${heading.variable} font-sans antialiased`}>
        <CartProvider>{children}</CartProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  )
}
