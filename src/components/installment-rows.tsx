"use client"

import Link from "next/link"
import { AlertCircle, Check, CheckCircle2, Clock } from "lucide-react"

import { InstallmentPaidButton } from "@/components/installment-paid-button"
import { formatPeriod } from "@/lib/cards"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatIsoForDisplay, isOverdue, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

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

/** Icono de estado de la cuota (pagada / vencida / pendiente). */
function CuotaStatusIcon({ paid, overdue }: { paid: boolean; overdue: boolean }) {
  if (paid) {
    return <CheckCircle2 className="size-3.5 shrink-0 text-pulse-green" aria-hidden />
  }
  if (overdue) {
    return <AlertCircle className="size-3.5 shrink-0 text-coral-red" aria-hidden />
  }
  return <Clock className="size-3.5 shrink-0 text-ember-orange" aria-hidden />
}

/** "Cuota 3", con icono de estado y marca de vencida cuando corresponde. */
function CuotaLabel({ row, today }: { row: Row; today: IsoDate }) {
  const overdue = !row.paid && isOverdue(row.dueDate, today)
  return (
    <span className="inline-flex items-center gap-2">
      <CuotaStatusIcon paid={row.paid} overdue={overdue} />
      <span className={cn("text-sm", row.paid ? "text-muted-foreground" : "font-medium text-foreground")}>
        Cuota {row.number}
      </span>
      {overdue && (
        <>
          {" "}
          <span className="rounded-full bg-coral-red/15 px-2 py-0.5 text-[11px] font-medium text-coral-red">
            vencida
          </span>
        </>
      )}
    </span>
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
          <TableCell key={col} className="text-xs text-muted-foreground tabular-nums">
            {formatIsoForDisplay(row.dueDate)}
          </TableCell>
        )
      case "description":
        return (
          <TableCell key={col} className="pl-6">
            <CuotaLabel row={row} today={today} />
          </TableCell>
        )
      case "amount":
        return (
          <TableCell
            key={col}
            className={cn(
              "tabular-nums text-right text-sm",
              row.paid ? "text-muted-foreground" : "font-medium text-foreground",
            )}
          >
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
        <TableRow
          key={row.id}
          className="border-white/[0.04] bg-white/[0.015] hover:bg-white/[0.025]"
        >
          <TableCell className="border-l-2 border-white/[0.08]" />
          {columns.map((col) => cell(col, row))}
          <TableCell />
        </TableRow>
      ))}
    </>
  )
}

/**
 * Las mismas cuotas fuera de una tabla (tarjetas móviles y dashboard):
 * cada cuota se presenta en una fila limpia dentro de un contenedor sutil.
 */
export function InstallmentRows({ rows, currency, today, description, kind, cardId }: Props) {
  return (
    <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
      {rows.map((row) => {
        const overdue = !row.paid && isOverdue(row.dueDate, today)
        return (
          <li key={row.id} className="space-y-2 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <CuotaLabel row={row} today={today} />
              <span
                className={cn(
                  "shrink-0 text-sm tabular-nums",
                  row.paid ? "text-muted-foreground" : "font-medium text-foreground",
                )}
              >
                {formatMoney(row.amountCents, currency)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pl-5">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  overdue ? "text-coral-red" : "text-muted-foreground",
                )}
              >
                Vence {formatIsoForDisplay(row.dueDate)}
              </span>
              <PaymentControl
                row={row}
                today={today}
                description={description}
                kind={kind}
                cardId={cardId}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
