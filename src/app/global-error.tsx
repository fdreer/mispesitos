"use client"

import { useEffect } from "react"
import { Inter } from "next/font/google"

import { Button } from "@/components/ui/button"

import "./globals.css"

/**
 * El último boundary de la app. `(app)/error.tsx` cubre las páginas de su
 * grupo, pero NO el layout de su propio segmento: un fallo adentro de
 * `requireSettings()` —la base caída, la sesión que no resuelve— sube más
 * arriba que ese boundary y termina en el "Application error" pelado de Next,
 * sin salida y sin decir nada.
 *
 * Reemplaza al layout raíz cuando se muestra, así que tiene que traer su
 * propio `<html>`, su propio `<body>` y su propia hoja de estilos: nada de
 * `app/layout.tsx` corre cuando se llega acá. La fuente se declara igual que
 * allá para que la pantalla de error no salga en Times New Roman.
 *
 * Mismo cuerpo y mismo criterio que `(app)/error.tsx`: el mensaje del error NO
 * se muestra —puede traer detalles de la base— y va a la consola, que es donde
 * sirve.
 */
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
  // En un efecto y no en el cuerpo del render: el cuerpo corre en cada
  // re-render, y dos veces bajo StrictMode en desarrollo. Mismo motivo que en
  // `(app)/error.tsx`.
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
