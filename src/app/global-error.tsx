"use client"

import { useEffect } from "react"
import { Inter } from "next/font/google"

import { Button } from "@/components/ui/button"

import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="antialiased">
        <div className="space-y-4 py-16 text-center">
          <h1 className="text-2xl font-semibold text-paper">Algo se rompió</h1>
          <p className="text-fog text-sm">
            No pudimos cargar la app. Probá de nuevo; si sigue pasando, recargá la página.
          </p>
          <Button onClick={reset}>Reintentar</Button>
        </div>
      </body>
    </html>
  )
}
