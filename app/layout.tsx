import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { CartProvider } from '@/components/cart/cart-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })

export const metadata: Metadata = {
  title: 'TodoPack Alcorta — Distribuidora',
  description:
    'Distribuidora TodoPack Alcorta. Bebidas, almacén, limpieza y más. Ventas por mayor y menor con entrega a domicilio.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#2b2622',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`}>
        <CartProvider>{children}</CartProvider>
        <Toaster richColors position="top-center" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
