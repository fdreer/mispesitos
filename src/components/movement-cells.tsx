"use client"

import { CategoryBadge } from "@/components/category-badge"
import { StatusBadge } from "@/components/status-badge"
import type { CategoryLabel } from "@/lib/category-tree"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { assertCurrency } from "@/lib/movement-asserts"
import type { ColumnId } from "@/lib/movement-columns"
import { pluralize } from "@/lib/movement-list-view"
import { summarizeMovementStatus } from "@/lib/movement-status"
import type { Category, MovementWithInstallments } from "@/server/queries"
import { CreditCard } from "lucide-react"

export function MovementStatusBadge({
  status,
  pendingCount,
  overdueCount,
}: ReturnType<typeof summarizeMovementStatus>) {
  if (status === "overdue") {
    return (
      <StatusBadge status="overdue">
        {pluralize(overdueCount, "vencida", "vencidas")}
      </StatusBadge>
    )
  }
  if (status === "pending") {
    return (
      <StatusBadge status="pending">
        {pluralize(pendingCount, "pendiente", "pendientes")}
      </StatusBadge>
    )
  }
  return <StatusBadge status="paid">Pagado</StatusBadge>
}

function CardLabel({ name }: { name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <CreditCard className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  )
}

export type MovementCellContext = {
  movement: MovementWithInstallments
  kind: "income" | "expense"
  today: IsoDate
  categories: Category[]
  categoryLabel: Map<string, CategoryLabel>
  cardName?: string
  nextText: string | null
  /** Columnas ocultas: su dato vuelve como subtítulo de la descripción. */
  hidden: Set<ColumnId>
}

export function MovementCell({ column, ...ctx }: { column: ColumnId } & MovementCellContext) {
  const m = ctx.movement
  const total = m.installments.length

  switch (column) {
    case "date":
      return <>{formatIsoForDisplay(m.date)}</>

    case "description":
      return (
        <>
          {m.description}
          {total > 1 && ctx.hidden.has("installments") && (
            <span className="text-muted-foreground"> · {total} cuotas</span>
          )}
          {ctx.nextText && ctx.hidden.has("nextDue") && (
            <span className="block text-xs text-muted-foreground">{ctx.nextText}</span>
          )}
          {ctx.cardName && (ctx.kind === "income" || ctx.hidden.has("paymentMethod")) && (
            <span className="block">
              <CardLabel name={ctx.cardName} />
            </span>
          )}
        </>
      )

    case "category": {
      const label = m.categoryId ? ctx.categoryLabel.get(m.categoryId) : undefined
      return label ? <CategoryBadge {...label} /> : <span className="text-muted-foreground">—</span>
    }

    case "paymentMethod":
      return ctx.cardName ? (
        <CardLabel name={ctx.cardName} />
      ) : (
        <span className="text-xs text-muted-foreground">Efectivo / débito</span>
      )

    case "installments": {
      if (total <= 1) return <span className="text-muted-foreground">—</span>
      const paid = m.installments.filter((i) => i.paid).length
      return (
        <span className="tabular-nums" title={`${paid} de ${total} cuotas pagas`}>
          {paid}/{total}
        </span>
      )
    }

    case "nextDue":
      return ctx.nextText ? (
        <span className="text-xs">{ctx.nextText}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )

    case "amount":
      return <>{formatMoney(m.amountCents, assertCurrency(m.currency))}</>

    case "status":
      return <MovementStatusBadge {...summarizeMovementStatus(m.installments, ctx.today)} />
  }
}
