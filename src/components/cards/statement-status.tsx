import { Check } from "lucide-react"

import type { StatementSummary } from "@/lib/cards"
import { formatIsoForDisplay, isOverdue, type IsoDate } from "@/lib/dates"

/**
 * En qué está un resumen, en una línea: pagado, vencido, por vencer, o
 * todavía abierto. Con icono además del color en los dos extremos (§5.3 del
 * plan v2: el estado no puede depender sólo del color).
 */
export function StatementStatus({
  statement,
  today,
}: {
  statement: Pick<StatementSummary, "closingDate" | "dueDate" | "paidDate" | "totals">
  today: IsoDate
}) {
  if (statement.paidDate) {
    return (
      <span className="text-primary inline-flex items-center gap-1">
        <Check className="size-4" aria-hidden />
        Pagado el {formatIsoForDisplay(statement.paidDate)}
      </span>
    )
  }
  if (statement.closingDate >= today) {
    return (
      <span className="text-muted-foreground">
        Abierto · cierra el {formatIsoForDisplay(statement.closingDate)} · vence el{" "}
        {formatIsoForDisplay(statement.dueDate)}
      </span>
    )
  }
  if (statement.totals.count === 0) {
    return <span className="text-muted-foreground">Sin compras</span>
  }
  if (isOverdue(statement.dueDate, today)) {
    return (
      <span className="text-destructive font-medium">
        Venció el {formatIsoForDisplay(statement.dueDate)} · sin pagar
      </span>
    )
  }
  return <span>Vence el {formatIsoForDisplay(statement.dueDate)}</span>
}
