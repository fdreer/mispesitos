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
  /** El período del resumen de tarjeta en el que cae, si la compra es con tarjeta. */
  statementPeriod?: string | null
}

type Props = {
  rows: Row[]
  currency: "ARS" | "USD"
  /**
   * `today` llega como prop y no se calcula acá: estos son componentes cliente,
   * y `todayInAr()` evaluado en el navegador puede dar un día distinto al que
   * usó el servidor para el mismo render. Alrededor de medianoche eso es un
   * mismatch de hidratación y un "vencida" que aparece o desaparece solo.
   */
  today: IsoDate
  /** Del movimiento: nombra la cuota en el toast y en la confirmación. */
  description: string
  kind: "income" | "expense"
  /** La tarjeta de la compra, si es con tarjeta: las cuotas enlazan a su resumen. */
  cardId?: string | null
}

/**
 * El control de pago de una cuota. Una cuota de una compra con tarjeta no se
 * paga sola (§1.3 del plan v2): en lugar del botón va un enlace a su resumen,
 * que es donde se paga, y si ya está pagada, la fecha.
 */
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
 * `colSpan` no se usa en ninguna celda: cada una cae en su columna sola. La
 * primera va vacía porque es la del chevron, que es del movimiento y no de la
 * cuota.
 */
export function InstallmentTableRows({ rows, currency, today, description, kind, cardId }: Props) {
  return (
    <>
      {rows.map((row) => (
        // Fondo propio y sin cambio en hover: estas filas cuelgan de la de
        // arriba y no son clickeables, así que no pueden ofrecer el mismo
        // resalte que una fila de movimiento que sí abre algo.
        <TableRow key={row.id} className="bg-muted/30 hover:bg-muted/30">
          <TableCell />
          <TableCell className="text-muted-foreground tabular-nums">
            {formatIsoForDisplay(row.dueDate)}
          </TableCell>
          <TableCell className="text-muted-foreground pl-6">
            <CuotaLabel row={row} today={today} />
          </TableCell>
          <TableCell />
          <TableCell className="tabular-nums">{formatMoney(row.amountCents, currency)}</TableCell>
          <TableCell>
            <PaymentControl
              row={row}
              today={today}
              description={description}
              kind={kind}
              cardId={cardId}
              align="start"
            />
          </TableCell>
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
