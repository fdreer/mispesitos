"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { isOverdue, todayInAr } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { setInstallmentPaid } from "@/server/actions/movements"

type Row = {
  id: string
  number: number
  dueDate: string
  amountCents: number
  paid: boolean
}

export function InstallmentRows({
  rows,
  currency,
}: {
  rows: Row[]
  currency: "ARS" | "USD"
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const today = todayInAr()

  function handleToggle(row: Row) {
    setError(null)
    startTransition(async () => {
      const result = await setInstallmentPaid(row.id, !row.paid)
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
                variant={row.paid ? "secondary" : "default"}
                disabled={pending}
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
