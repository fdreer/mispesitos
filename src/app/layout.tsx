import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { Toaster } from "@/components/ui/sonner"

import "./globals.css"

// `variable` publica `--font-inter` sobre <html>; globals.css la consume desde
// `--font-sans`. `display: "swap"` muestra el texto con el stack de sistema
// mientras Inter carga, en vez de dejar la pantalla en blanco.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Mis Pesitos",
  description: "Finanzas personales en pesos y dólares.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="antialiased">
        {children}
        {/* Uno solo para toda la app: confirma las acciones (§5.5 del plan v2). */}
        <Toaster position="bottom-center" />
      </body>
    </html>
  )
}
