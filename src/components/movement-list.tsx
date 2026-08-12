"use client"

import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { StatusBadge } from "@/components/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DeleteMovementButton } from "@/components/delete-movement-button"
import { InstallmentTableRows } from "@/components/installment-rows"
import { MovementFormDialog } from "@/components/movement-form-dialog"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { assertCurrency, assertInstallmentMovementKind } from "@/lib/movement-asserts"
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

/**
 * Los encabezados en un solo lugar: el esqueleto de más abajo pinta la MISMA
 * fila de encabezados mientras la consulta viaja, así que si viviera duplicada
 * agregar una columna a la tabla dejaría al esqueleto prometiendo otra grilla.
 * La primera columna no tiene título (es la del chevron que despliega las
 * cuotas) y por eso va aparte, no en esta lista.
 */
const COLUMNS = ["Fecha", "Descripción", "Categoría", "Importe", "Estado"] as const

function MovementTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-8" />
        {COLUMNS.map((c) => (
          <TableHead key={c}>{c}</TableHead>
        ))}
      </TableRow>
    </TableHeader>
  )
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
      <MovementTableHeader />
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
          const categoria = m.categoryId ? categoryName.get(m.categoryId) : undefined

          return (
            <Fragment key={m.id}>
              {/* La fila entera es el disparador, pero el teclado necesita un
                  control real: sin `tabIndex`/`onKeyDown` las cuotas de cada
                  movimiento eran inalcanzables sin mouse. `role="button"` no
                  va acá —rompería la semántica de tabla para un lector de
                  pantalla—; `aria-expanded` sobre la fila ya comunica el
                  estado, y la celda del chevron lleva el nombre accesible. */}
              <TableRow
                className="cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => toggle(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    toggle(m.id)
                  }
                }}
              >
                <TableCell>
                  {isOpen ? (
                    <ChevronDown className="text-muted-foreground size-4" />
                  ) : (
                    <ChevronRight className="text-muted-foreground size-4" />
                  )}
                  <span className="sr-only">
                    {isOpen ? "Ocultar cuotas de" : "Ver cuotas de"} {m.description}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatIsoForDisplay(m.date)}
                </TableCell>
                <TableCell className="max-w-64 truncate whitespace-normal">
                  {m.description}
                  {m.installments.length > 1 && (
                    <span className="text-muted-foreground"> · {m.installments.length} cuotas</span>
                  )}
                </TableCell>
                <TableCell>
                  {/* `categoryName.get` puede no encontrar nada aunque el
                      movimiento tenga `categoryId`: la lista que llega por
                      props es la del tipo de esta pantalla. El guión es para
                      los dos casos, sin categoría y sin nombre resoluble. */}
                  {categoria ? <CategoryBadge name={categoria} /> : "—"}
                </TableCell>
                <TableCell className="tabular-nums">{formatMoney(m.amountCents, currency)}</TableCell>
                <TableCell>
                  {status === "overdue" && (
                    <StatusBadge status="overdue">{overdueCount} vencida(s)</StatusBadge>
                  )}
                  {status === "pending" && (
                    <StatusBadge status="pending">{pendingCount} pendiente(s)</StatusBadge>
                  )}
                  {status === "paid" && <StatusBadge status="paid">Pagado</StatusBadge>}
                </TableCell>
              </TableRow>
              {isOpen && (
                <>
                  <InstallmentTableRows
                    rows={m.installments}
                    currency={currency}
                    today={today}
                  />
                  {/* Editar y borrar son del movimiento, no de una cuota: van
                      en su propia fila de cierre, alineados a la columna
                      Estado —la misma donde cada cuota tiene su botón— para
                      que las acciones queden todas sobre el mismo eje. */}
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={5} />
                    <TableCell>
                      <div className="flex items-start gap-1">
                        {/* Sin cotización sugerida: editando manda el TC con
                            el que se guardó el movimiento, que es el del día
                            en que ocurrió (ver `MovementForm`). Pedirle una
                            sugerencia a dolarapi por cada fila desplegada
                            sería una llamada de red para un dato que este
                            formulario no va a usar. */}
                        <MovementFormDialog
                          kind={assertInstallmentMovementKind(m.kind)}
                          categories={categories}
                          suggestedRate={null}
                          today={today}
                          movement={m}
                        />
                        <DeleteMovementButton id={m.id} description={m.description} />
                      </div>
                    </TableCell>
                  </TableRow>
                </>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

/**
 * La tabla mientras la consulta viaja: encabezados de verdad (los mismos que
 * `MovementList`, ver `MovementTableHeader`) y filas en gris. La grilla ya
 * está pintada cuando llegan los datos, así que lo único que cambia es el
 * contenido de las celdas.
 *
 * `rows` no puede adivinar cuántos movimientos van a venir. Cinco es un piso
 * que casi siempre se llena —la página trae hasta PAGE_SIZE— y deja la tabla
 * con altura suficiente para leerse como tabla sin empujar media pantalla
 * hacia abajo si al final vienen menos.
 */
export function MovementListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Table>
      <MovementTableHeader />
      <TableBody>
        {Array.from({ length: rows }, (_, i) => (
          <TableRow key={i} className="hover:bg-transparent">
            <TableCell />
            {COLUMNS.map((c) => (
              <TableCell key={c}>
                <div className="h-4 animate-pulse rounded bg-graphite" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
