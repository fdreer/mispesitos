"use client"

import { useState, useTransition, type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { deleteMovement } from "@/server/actions/movements"

type Props = {
  id: string
  description: string
}

export function DeleteMovementButton({ id, description }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Este botón vive dentro del <summary> de un <details> (Task 14): sin este
    // preventDefault, el click también togglea el detalle además de borrar.
    event.preventDefault()

    const confirmed = window.confirm(
      `¿Borrar "${description}"? Se borran también sus cuotas y no se puede deshacer.`,
    )
    if (!confirmed) return

    setError(null)
    startTransition(async () => {
      const result = await deleteMovement(id)
      if (!result.ok) {
        setError(result.message)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Borrando…" : "Borrar"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
