"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { isOverdue, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { setInstallmentPaid } from "@/server/actions/movements"

type Row = {
  id: string
  number: number
  dueDate: string
  amountCents: number
  paid: boolean
}

/**
 * `today` llega como prop y no se calcula acá: este es un componente cliente,
 * y `todayInAr()` evaluado en el navegador puede dar un día distinto al que
 * usó el servidor para el mismo render. Alrededor de medianoche eso es un
 * mismatch de hidratación y un badge "vencida" que aparece o desaparece solo.
 * El servidor ya tiene la fecha; se pasa.
 */
export function InstallmentRows({
  rows,
  currency,
  today,
}: {
  rows: Row[]
  currency: "ARS" | "USD"
  today: IsoDate
}) {
  const [, startTransition] = useTransition()
  // Un Set de ids en vuelo, no un booleano de la lista entera ni un único id:
  // con un flag compartido, marcar una cuota dejaba muertos los botones de
  // las otras 19. Con un solo id, tocar la fila B mientras A todavía está en
  // vuelo pisaba el valor y reactivaba el botón de A a mitad de su propio
  // pedido. Cada fila entra y sale del Set por su cuenta, así que empezar
  // una nunca reactiva a otra.
  const [enVuelo, setEnVuelo] = useState<Set<string>>(new Set())
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  function handleToggle(row: Row) {
    setError(null)
    setEnVuelo((prev) => new Set(prev).add(row.id))
    startTransition(async () => {
      const result = await setInstallmentPaid(row.id, !row.paid)
      setEnVuelo((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      if (!result.ok) {
        setError({ id: row.id, message: result.message })
      }
    })
  }

  return (
    <ul className="mt-2 space-y-1 border-t pt-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Cuota {row.number} · vence {row.dueDate}
            {!row.paid && isOverdue(row.dueDate, today) && (
              <span className="text-destructive font-medium"> · vencida</span>
            )}
          </span>
          <span className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{formatMoney(row.amountCents, currency)}</span>
              <Button
                type="button"
                size="sm"
                variant={row.paid ? "secondary" : "outline"}
                disabled={enVuelo.has(row.id)}
                onClick={() => handleToggle(row)}
              >
                {row.paid ? "Pagada" : "Marcar pagada"}
              </Button>
            </span>
            {error?.id === row.id && <p className="text-destructive text-xs">{error.message}</p>}
          </span>
        </li>
      ))}
    </ul>
  )
}
