"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

export default function AppError({
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
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-paper">Algo se rompió</h1>
      <p className="text-fog text-sm">
        No pudimos mostrar esta pantalla. Probá de nuevo; si sigue pasando, recargá la página.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  )
}
