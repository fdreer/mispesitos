import { CircleDashed } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import type { StatementSummary } from "@/lib/cards"
import { diffDaysIso, formatRelativeDue, isOverdue, type IsoDate } from "@/lib/dates"

type StatementLike = Pick<StatementSummary, "closingDate" | "dueDate" | "paidDate" | "totals">

export type StatementState = "paid" | "open" | "empty" | "overdue" | "due"

/** En qué está un resumen hoy. Las fechas ISO se comparan como texto. */
export function statementState(statement: StatementLike, today: IsoDate): StatementState {
  if (statement.paidDate) return "paid"
  if (statement.closingDate >= today) return "open"
  if (statement.totals.count === 0) return "empty"
  if (isOverdue(statement.dueDate, today)) return "overdue"
  return "due"
}

/** `2026-12-17` → `17/12`: el año sobra para fechas de este ciclo. */
export function shortDate(iso: IsoDate): string {
  const [, month, day] = iso.split("-")
  return `${day}/${month}`
}

/**
 * La pastilla de estado de un resumen, con los mismos colores e íconos que el
 * estado de los movimientos: vencido en rojo, a pagar en naranja, pagado en
 * verde. Abierto y sin compras quedan neutros.
 */
export function StatementBadge({
  statement,
  today,
}: {
  statement: StatementLike
  today: IsoDate
}) {
  const state = statementState(statement, today)
  switch (state) {
    case "paid":
      return <StatusBadge status="paid">Pagado el {shortDate(statement.paidDate!)}</StatusBadge>
    case "overdue":
      return (
        <StatusBadge status="overdue">
          {capitalize(formatRelativeDue(statement.dueDate, today, shortDate(statement.dueDate)))}
        </StatusBadge>
      )
    case "due":
      return (
        <StatusBadge status="pending">
          {capitalize(formatRelativeDue(statement.dueDate, today, shortDate(statement.dueDate)))}
        </StatusBadge>
      )
    case "open":
      return (
        <Badge variant="secondary">
          <CircleDashed aria-hidden />
          Abierto
        </Badge>
      )
    case "empty":
      return <Badge variant="secondary">Sin compras</Badge>
  }
}

/** "hoy", "mañana", "en 5 días", "ayer", "hace 3 días": para leer fechas sin contar. */
export function relativeDay(target: IsoDate, today: IsoDate): string {
  const diff = diffDaysIso(target, today)
  if (diff === 0) return "hoy"
  if (diff === 1) return "mañana"
  if (diff === -1) return "ayer"
  return diff > 0 ? `en ${diff} días` : `hace ${-diff} días`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
