"use client"

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
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error(error)

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
