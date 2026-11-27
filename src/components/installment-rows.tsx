"use client"

import Link from "next/link"
import { Check } from "lucide-react"

import { InstallmentPaidButton } from "@/components/installment-paid-button"
import { formatPeriod } from "@/lib/cards"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatIsoForDisplay, isOverdue, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"

type Row = {
  id: string
  number: number
  dueDate: string
  amountCents: number
  paid: boolean
  paidDate?: string | null
  statementPeriod?: string | null
}

type Props = {
  rows: Row[]
  currency: "ARS" | "USD"
  today: IsoDate
  description: string
  kind: "income" | "expense"
  cardId?: string | null
}

function PaymentControl({
  row,
  today,
  description,
  kind,
  cardId,
  align,
}: {
  row: Row
  today: IsoDate
  description: string
  kind: "income" | "expense"
  cardId?: string | null
  align?: "start" | "end"
}) {
  if (cardId && row.statementPeriod) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {row.paid && (
          <span className="inline-flex items-center gap-1 text-primary">
            <Check className="size-3.5" aria-hidden />
            Pagada{row.paidDate ? ` · ${formatIsoForDisplay(row.paidDate)}` : ""}
          </span>
        )}
        <Link
          href={`/tarjetas/${cardId}?periodo=${row.statementPeriod}`}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Resumen {formatPeriod(row.statementPeriod)}
        </Link>
      </span>
    )
  }
  return (
    <InstallmentPaidButton
      id={row.id}
      paid={row.paid}
      paidDate={row.paidDate}
      today={today}
      number={row.number}
      description={description}
      kind={kind}
      align={align}
    />
  )
}

const DEFAULT_TABLE_COLUMNS = ["date", "description", "category", "amount", "status"] as const

/** "Cuota 3", más la marca de vencida cuando corresponde. */
function CuotaLabel({ row, today }: { row: Row; today: IsoDate }) {
  return (
    <>
      Cuota {row.number}
      {!row.paid && isOverdue(row.dueDate, today) && (
        <span className="text-destructive font-medium"> · vencida</span>
      )}
    </>
  )
}

/**
 * Las cuotas de un movimiento, como filas de la MISMA tabla que las contiene:
 * el vencimiento cae en la columna Fecha, "Cuota N" en Descripción, el importe
 * en Importe y el botón en Estado.
 *
 * Antes esto era una lista suelta metida adentro de una celda con `colSpan`, y
 * eso rompía justo lo que hace legible una tabla: la fecha de la cuota quedaba
 * pegada a la izquierda bajo Descripción, el importe flotaba a la derecha sin
 * relación con la columna Importe, y había que releer cada renglón en vez de
 * bajar la vista por una columna.
 *
 * `colSpan` no se usa en ninguna celda: cada una cae en su columna sola,
 * siguiendo el orden de `columns` (el que eligió la persona en la tabla). La
 * primera va vacía porque es la del chevron, que es del movimiento y no de la
 * cuota.
 */
export function InstallmentTableRows({
  rows,
  currency,
  today,
  description,
  kind,
  cardId,
  columns = DEFAULT_TABLE_COLUMNS,
}: Props & { columns?: readonly string[] }) {
  function cell(col: string, row: Row) {
    switch (col) {
      case "date":
        return (
          <TableCell key={col} className="text-muted-foreground tabular-nums">
            {formatIsoForDisplay(row.dueDate)}
          </TableCell>
        )
      case "description":
        return (
          <TableCell key={col} className="text-muted-foreground pl-6">
            <CuotaLabel row={row} today={today} />
          </TableCell>
        )
      case "amount":
        return (
          <TableCell key={col} className="tabular-nums text-right">
            {formatMoney(row.amountCents, currency)}
          </TableCell>
        )
      case "status":
        return (
          <TableCell key={col} className="overflow-visible">
            <PaymentControl
              row={row}
              today={today}
              description={description}
              kind={kind}
              cardId={cardId}
              align="start"
            />
          </TableCell>
        )
      default:
        return <TableCell key={col} />
    }
  }

  return (
    <>
      {rows.map((row) => (
        // Fondo propio y sin cambio en hover: estas filas cuelgan de la de
        // arriba y no son clickeables, así que no pueden ofrecer el mismo
        // resalte que una fila de movimiento que sí abre algo.
        <TableRow key={row.id} className="bg-muted/30 hover:bg-muted/30">
          <TableCell />
          {columns.map((col) => cell(col, row))}
          <TableCell />
        </TableRow>
      ))}
    </>
  )
}

/**
 * Las mismas cuotas fuera de una tabla: los vencimientos del dashboard, donde
 * cada ítem es un `<li>` y no hay columnas contra las cuales alinear. Es el
 * formato que tenía antes esta pantalla, y el único lugar que todavía lo usa.
 */
export function InstallmentRows({ rows, currency, today, description, kind, cardId }: Props) {
  return (
    <ul className="mt-2 space-y-1 border-t pt-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-col items-start justify-between gap-2 text-sm sm:flex-row sm:items-center"
        >
          <span className="text-muted-foreground">
            <CuotaLabel row={row} today={today} /> · vence {formatIsoForDisplay(row.dueDate)}
          </span>
          <span className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <span className="tabular-nums">{formatMoney(row.amountCents, currency)}</span>
            <PaymentControl
              row={row}
              today={today}
              description={description}
              kind={kind}
              cardId={cardId}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}
