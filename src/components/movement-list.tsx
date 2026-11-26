"use client"

import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { categoryLabels, type CategoryLabel } from "@/lib/category-tree"
import { StatusBadge } from "@/components/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InstallmentRows, InstallmentTableRows } from "@/components/installment-rows"
import {
  MovementRowActions,
  nextInstallmentText,
  PayNextButton,
} from "@/components/movement-row-actions"
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
 * La primera columna (el chevron que despliega las cuotas) y la última (Pagar
 * y el menú ⋯) no tienen título visible y por eso van aparte, no en esta lista.
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
        <TableHead>
          <span className="sr-only">Acciones</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}

function MovementStatusBadge({
  status,
  pendingCount,
  overdueCount,
}: ReturnType<typeof summarizeMovementStatus>) {
  if (status === "overdue") return <StatusBadge status="overdue">{overdueCount} vencida(s)</StatusBadge>
  if (status === "pending") return <StatusBadge status="pending">{pendingCount} pendiente(s)</StatusBadge>
  return <StatusBadge status="paid">Pagado</StatusBadge>
}

function MovementCards({
  movements,
  categories,
  categoryLabel,
  today,
  expanded,
  toggle,
}: {
  movements: MovementWithInstallments[]
  categories: Category[]
  categoryLabel: Map<string, CategoryLabel>
  today: IsoDate
  expanded: Set<string>
  toggle: (id: string) => void
}) {
  return (
    <div className="space-y-2 md:hidden">
      {movements.map((m) => {
        const summary = summarizeMovementStatus(m.installments, today)
        const currency = assertCurrency(m.currency)
        const kind = assertInstallmentMovementKind(m.kind)
        const isOpen = expanded.has(m.id)
        const categoria = m.categoryId ? categoryLabel.get(m.categoryId) : undefined
        const detailsId = `cuotas-${m.id}`
        const nextText = nextInstallmentText(m, today)

        return (
          <article key={m.id} aria-label={m.description} className="rounded-lg border border-border bg-background p-3">
            <button
              type="button"
              className="flex min-h-11 w-full items-start justify-between gap-3 text-left"
              aria-label={`${isOpen ? "Ocultar" : "Ver"} cuotas de ${m.description}`}
              aria-expanded={isOpen}
              aria-controls={detailsId}
              onClick={() => toggle(m.id)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{m.description}</span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {formatIsoForDisplay(m.date)}
                  {m.installments.length > 1 && <span>· {m.installments.length} cuotas</span>}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums font-medium text-foreground">
                {formatMoney(m.amountCents, currency)}
              </span>
            </button>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span>{categoria ? <CategoryBadge {...categoria} /> : "—"}</span>
              <MovementStatusBadge {...summary} />
            </div>

            {/* La próxima cuota y las acciones de un toque: Pagar sin tener
                que desplegar nada, y el menú ⋯ con Editar y Borrar. */}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-muted-foreground">{nextText}</span>
              <span className="flex shrink-0 items-center gap-1">
                <PayNextButton movement={m} kind={kind} />
                <MovementRowActions
                  movement={m}
                  kind={kind}
                  categories={categories}
                  today={today}
                />
              </span>
            </div>

            {isOpen && (
              <div id={detailsId} className="mt-3 border-t pt-1">
                <InstallmentRows
                  rows={m.installments}
                  currency={currency}
                  today={today}
                  description={m.description}
                  kind={kind}
                />
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

export function MovementList({ movements, categories, today, emptyMessage }: Props) {
  // Nombre, padre y color de cada categoría, con la herencia ya resuelta.
  const categoryLabel = categoryLabels(categories)
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
    <>
      <div className="hidden md:block">
        <Table>
          <MovementTableHeader />
          <TableBody>
            {movements.map((m) => {
              // El mismo cálculo que usa el filtro de estado de esta pantalla:
              // el badge y el filtro no pueden discrepar sobre qué está vencido.
              const summary = summarizeMovementStatus(m.installments, today)
              const currency = assertCurrency(m.currency)
              const kind = assertInstallmentMovementKind(m.kind)
              const isOpen = expanded.has(m.id)
              const categoria = m.categoryId ? categoryLabel.get(m.categoryId) : undefined
              const nextText = nextInstallmentText(m, today)

              return (
                <Fragment key={m.id}>
                  {/* La fila entera es el disparador, pero el teclado necesita
                      un control real: sin `tabIndex`/`onKeyDown` las cuotas de
                      cada movimiento eran inalcanzables sin mouse.
                      `role="button"` no va acá —rompería la semántica de tabla
                      para un lector de pantalla—; `aria-expanded` sobre la fila
                      ya comunica el estado, y la celda del chevron lleva el
                      nombre accesible. */}
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
                      {nextText && (
                        <span className="block text-xs text-muted-foreground">{nextText}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* `categoryLabel.get` puede no encontrar nada aunque el
                          movimiento tenga `categoryId`: la lista que llega por
                          props es la del tipo de esta pantalla. El guión es
                          para los dos casos, sin categoría y sin nombre
                          resoluble. */}
                      {categoria ? <CategoryBadge {...categoria} /> : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatMoney(m.amountCents, currency)}</TableCell>
                    <TableCell>
                      <MovementStatusBadge {...summary} />
                    </TableCell>
                    {/* Los clics y las teclas de esta celda no llegan a la
                        fila: si no, pagar desplegaría las cuotas. Y como React
                        propaga los eventos a través de los portales, sin esto
                        escribir un espacio en el formulario de edición —que
                        cuelga de acá— plegaría la fila, y el `preventDefault`
                        de su `onKeyDown` se comería el espacio. */}
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <PayNextButton movement={m} kind={kind} />
                        <MovementRowActions
                          movement={m}
                          kind={kind}
                          categories={categories}
                          today={today}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <InstallmentTableRows
                      rows={m.installments}
                      currency={currency}
                      today={today}
                      description={m.description}
                      kind={kind}
                    />
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <MovementCards
        movements={movements}
        categories={categories}
        categoryLabel={categoryLabel}
        today={today}
        expanded={expanded}
        toggle={toggle}
      />
    </>
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
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
