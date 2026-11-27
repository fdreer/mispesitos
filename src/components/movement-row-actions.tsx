"use client"

import { useState, useTransition } from "react"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { markInstallmentPaid } from "@/components/installment-toasts"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { IsoDate } from "@/lib/dates"
import { describeNextInstallment, nextUnpaidInstallment } from "@/lib/installments"
import type { MovementWithInstallments } from "@/server/queries"

type Kind = "income" | "expense"

export function MovementRowActions({
  movement,
  kind,
  onEdit,
  onDelete,
  deleting = false,
}: {
  movement: MovementWithInstallments
  kind: Kind
  onEdit: (movement: MovementWithInstallments, kind: Kind) => void
  onDelete: (movement: MovementWithInstallments) => void
  deleting?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={deleting}
          aria-label={`Acciones de ${movement.description}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(movement, kind)}>
          <Pencil />
          Editar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(movement)}>
          <Trash2 />
          Borrar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * "Pagar" en un toque desde la fila (§5.1 del plan v2): marca la próxima cuota
 * impaga con la fecha de hoy y avisa con "Pagada · Deshacer". Para otra fecha
 * está el calendario de cada cuota, con la fila desplegada.
 *
 * No se dibuja si ya está todo pago: no hay nada que hacer en un toque. Ni
 * en una compra con tarjeta: sus cuotas se pagan con el resumen (§1.3 del
 * plan v2), desde /tarjetas.
 */
export function PayNextButton({
  movement,
  kind,
}: {
  movement: MovementWithInstallments
  kind: Kind
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const next = nextUnpaidInstallment(movement.installments)
  if (!next || movement.creditCardId) return null

  const total = movement.installments.length
  const verb = kind === "income" ? "Cobrar" : "Pagar"
  const which = total > 1 ? ` cuota ${next.number}/${total}` : ""

  function handleClick(e: React.MouseEvent) {
    // La fila de escritorio despliega las cuotas al hacer clic: pagar no
    // tiene que desplegar nada.
    e.stopPropagation()
    if (!next) return
    setError(null)
    startTransition(async () => {
      const result = await markInstallmentPaid({
        id: next.id,
        kind,
        description: `${movement.description}${which ? ` ·${which}` : ""}`,
      })
      if (!result.ok) setError(result.message)
    })
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`${verb}${which} de ${movement.description}`}
        onClick={handleClick}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {verb}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </span>
  )
}

/** "Cuota 3/12 · vence 15/12" de la próxima impaga, o null si está todo pago. */
export function nextInstallmentText(
  movement: MovementWithInstallments,
  today: IsoDate,
): string | null {
  const next = nextUnpaidInstallment(movement.installments)
  return next ? describeNextInstallment(next, movement.installments.length, today) : null
}
