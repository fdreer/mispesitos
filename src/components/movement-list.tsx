"use client"

import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DeleteMovementButton } from "@/components/delete-movement-button"
import { InstallmentRows } from "@/components/installment-rows"
import { type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { assertCurrency } from "@/lib/movement-asserts"
import { summarizeMovementStatus } from "@/lib/movement-status"
import type { Category, MovementWithInstallments } from "@/server/queries"

type Props = {
  movements: MovementWithInstallments[]
  categories: Category[]
  today: IsoDate
  /**
   * Sin esto, filtrar hasta cero resultados decía "todavía no cargaste nada":
   * el mensaje contradecía la tabla que la persona acababa de llenar.
   */
  emptyMessage: string
}

export function MovementList({ movements, categories, today, emptyMessage }: Props) {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (movements.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Fecha</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Importe</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.map((m) => {
          // El mismo cálculo que usa el filtro de estado de esta pantalla: el
          // badge y el filtro no pueden discrepar sobre qué está vencido.
          const { status, pendingCount, overdueCount } = summarizeMovementStatus(
            m.installments,
            today,
          )
          const currency = assertCurrency(m.currency)
          const isOpen = expanded.has(m.id)

          return (
            <Fragment key={m.id}>
              <TableRow
                className="cursor-pointer"
                aria-expanded={isOpen}
                onClick={() => toggle(m.id)}
              >
                <TableCell>
                  {isOpen ? (
                    <ChevronDown className="text-muted-foreground size-4" />
                  ) : (
                    <ChevronRight className="text-muted-foreground size-4" />
                  )}
                </TableCell>
                <TableCell>{m.date}</TableCell>
                <TableCell className="max-w-64 truncate whitespace-normal">
                  {m.description}
                  {m.installments.length > 1 && (
                    <span className="text-muted-foreground"> · {m.installments.length} cuotas</span>
                  )}
                </TableCell>
                <TableCell>{m.categoryId ? categoryName.get(m.categoryId) : "—"}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(m.amountCents, currency)}</TableCell>
                <TableCell>
                  {status === "overdue" && (
                    <Badge variant="destructive">{overdueCount} vencida(s)</Badge>
                  )}
                  {status === "pending" && (
                    <Badge variant="secondary">{pendingCount} pendiente(s)</Badge>
                  )}
                  {status === "paid" && <Badge variant="secondary">Pagado</Badge>}
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="whitespace-normal">
                    <InstallmentRows rows={m.installments} currency={currency} today={today} />
                    <div className="mt-2 flex justify-end">
                      <DeleteMovementButton id={m.id} description={m.description} />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
