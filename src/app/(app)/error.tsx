"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

/**
 * Boundary de error de toda la app. Sin este archivo, cualquier throw —el de
 * un `assert*` ante una fila inesperada, el de una consulta que se cayó—
 * sube al boundary por defecto de Next y deja "Application error" sin ninguna
 * salida. Los asserts de `@/lib/movement-asserts` están hechos para fallar
 * fuerte a propósito; fallar fuerte tiene que terminar en una pantalla que se
 * pueda reintentar, no en una en blanco.
 *
 * El mensaje del error NO se muestra: puede traer detalles de la base. Va a
 * la consola del navegador, que es donde sirve.
 *
 * Este boundary cubre las páginas del grupo (app) pero no el layout de su
 * propio segmento: para eso está `src/app/global-error.tsx`, con el mismo
 * cuerpo.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // En un efecto y no en el cuerpo del render: el cuerpo corre en cada
  // re-render, y dos veces bajo StrictMode en desarrollo, así que el mismo
  // error se logueaba varias veces.
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-paper">Algo se rompió</h1>
      <p className="text-fog text-sm">
        No pudimos mostrar esta pantalla. Probá de nuevo; si sigue pasando, recargá la página.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  )
}
