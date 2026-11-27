"use client"

import { Fragment, useCallback, useRef, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"

import { ColumnHeader } from "@/components/data-table/column-header"
import { useColumnReorder } from "@/components/data-table/use-column-reorder"
import { InstallmentTableRows } from "@/components/installment-rows"
import { MovementCell } from "@/components/movement-cells"
import { MovementRowActions, nextInstallmentText, PayNextButton } from "@/components/movement-row-actions"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { useTablePrefs } from "@/hooks/use-table-prefs"
import type { CategoryLabel } from "@/lib/category-tree"
import type { IsoDate } from "@/lib/dates"
import { assertCurrency, assertInstallmentMovementKind } from "@/lib/movement-asserts"
import {
  ACTIONS_MIN_WIDTH,
  CHEVRON_WIDTH,
  clampWidth,
  type ColumnDef,
  type ColumnId,
  type MovementKind,
} from "@/lib/movement-columns"
import type { MovementGroup, MovementSort } from "@/lib/movement-list-view"
import { buildMovementHref, nextHeaderSort, type MovementQuery } from "@/lib/movement-query"
import { cn } from "@/lib/utils"
import type { Category, MovementWithInstallments } from "@/server/queries"

/** Padding horizontal de una celda (`px-2`) más un respiro, para autoajustar. */
const CELL_CHROME = 20

export type MovementTableProps = {
  kind: MovementKind
  groups: MovementGroup<MovementWithInstallments>[]
  categories: Category[]
  categoryLabel: Map<string, CategoryLabel>
  cardNameById: Map<string, string>
  today: IsoDate
  expanded: Set<string>
  toggle: (id: string) => void
  onEdit: (movement: MovementWithInstallments, kind: "income" | "expense") => void
  onDelete: (movement: MovementWithInstallments) => void
  deletingId: string | null
  basePath?: string
  query?: MovementQuery
  defaultSort?: MovementSort
}

/** Envuelve el contenido de una celda para poder medir su ancho natural. */
function CellContent({ align, children }: { align: "left" | "right"; children: ReactNode }) {
  return (
    <div
      data-cell-content
      className={cn("w-max max-w-full min-w-0 truncate", align === "right" && "ml-auto")}
    >
      {children}
    </div>
  )
}

/**
 * Tabla de escritorio de movimientos estilo ClickUp: columnas que se
 * redimensionan, se reordenan arrastrando el encabezado, se ocultan desde el
 * menú "Columnas" y ordenan la lista al clickear el encabezado.
 */
export function MovementTable({
  kind,
  groups,
  categories,
  categoryLabel,
  cardNameById,
  today,
  expanded,
  toggle,
  onEdit,
  onDelete,
  deletingId,
  basePath,
  query,
  defaultSort = "date",
}: MovementTableProps) {
  const { push } = useRouter()
  const [sorting, startSorting] = useTransition()
  const { visibleColumns, widthOf, setWidth, moveColumn } = useTablePrefs(kind)
  const tableRef = useRef<HTMLTableElement>(null)

  const visibleIds = visibleColumns.map((c) => c.id)
  const reorder = useColumnReorder<ColumnId>({ ids: visibleIds, onMove: moveColumn })

  const totalWidth =
    CHEVRON_WIDTH + ACTIONS_MIN_WIDTH + visibleColumns.reduce((acc, c) => acc + widthOf(c), 0)

  const canSort = Boolean(basePath && query)

  function handleSort(column: MovementSort) {
    if (!basePath || !query) return
    const patch = nextHeaderSort(query, column, defaultSort)
    startSorting(() => push(buildMovementHref(basePath, query, patch, defaultSort)))
  }

  /**
   * Actualiza el ancho de `<col>` y `minWidth` de la tabla directo en el DOM
   * durante el arrastre para mantener 60fps sin re-renderizar las filas.
   */
  const handleResize = useCallback(
    (c: ColumnDef, rawWidth: number) => {
      const table = tableRef.current
      if (!table) return
      const clamped = clampWidth(c, rawWidth)
      const col = table.querySelector<HTMLTableColElement>(`col[data-col="${c.id}"]`)
      if (col) col.style.width = `${clamped}px`
      table.style.minWidth = `${totalWidth - widthOf(c) + clamped}px`
    },
    [totalWidth, widthOf],
  )

  const autoFit = useCallback(
    (c: ColumnDef) => {
      const table = tableRef.current
      if (!table) return
      let max = 0
      for (const el of table.querySelectorAll<HTMLElement>(
        `td[data-col="${c.id}"] [data-cell-content]`,
      )) {
        max = Math.max(max, el.scrollWidth)
      }
      const head = table.querySelector<HTMLElement>(`th[data-col="${c.id}"] button, th[data-col="${c.id}"] > div > span`)
      if (head) max = Math.max(max, head.scrollWidth + 16)
      setWidth(c.id, clampWidth(c, max + CELL_CHROME))
    },
    [setWidth],
  )

  const colSpan = visibleColumns.length + 2

  return (
    <div className={cn("transition-opacity", sorting && "opacity-60")} aria-busy={sorting}>
      <Table ref={tableRef} className="table-fixed" style={{ minWidth: totalWidth }}>
        <colgroup>
          <col style={{ width: CHEVRON_WIDTH }} />
          {visibleColumns.map((c) => (
            <col key={c.id} data-col={c.id} style={{ width: widthOf(c) }} />
          ))}
          <col />
        </colgroup>
        <thead data-slot="table-header" className="[&_tr]:border-b">
          <tr data-slot="table-row" className="border-b">
            <th aria-hidden className="h-9" />
            {visibleColumns.map((c, i) => (
              <ColumnHeader
                key={c.id}
                id={c.id}
                label={c.label}
                width={widthOf(c)}
                minWidth={c.minWidth}
                align={c.align}
                sorted={canSort && c.sortKey && query?.sort === c.sortKey ? query.dir : null}
                onSort={canSort && c.sortKey ? () => handleSort(c.sortKey!) : undefined}
                onResize={(w) => handleResize(c, w)}
                onResizeEnd={(w) => setWidth(c.id, w)}
                onAutoFit={() => autoFit(c)}
                onDragStart={(e) => reorder.start(e, c.id)}
                onMoveBy={(delta) => {
                  const target = i + delta
                  if (target < 0 || target >= visibleIds.length) return
                  moveColumn(c.id, delta < 0 ? visibleIds[target] : (visibleIds[target + 1] ?? null))
                }}
                shouldIgnoreClick={reorder.shouldIgnoreClick}
                dragging={reorder.draggingId === c.id}
                dropIndicator={reorder.indicatorFor(c.id)}
              />
            ))}
            <th className="h-9">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              {group.label && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell
                    colSpan={colSpan}
                    className="py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    {group.label} · {group.items.length}
                  </TableCell>
                </TableRow>
              )}
              {group.items.map((m) => {
                const currency = assertCurrency(m.currency)
                const itemKind = assertInstallmentMovementKind(m.kind)
                const isOpen = expanded.has(m.id)
                const cardName = m.creditCardId ? cardNameById.get(m.creditCardId) : undefined
                const ctx = {
                  movement: m,
                  kind: itemKind,
                  today,
                  categories,
                  categoryLabel,
                  cardName,
                  nextText: nextInstallmentText(m, today),
                }

                return (
                  <Fragment key={m.id}>
                    <TableRow
                      className="cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => toggle(m.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
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
                      {visibleColumns.map((c) => (
                        <TableCell
                          key={c.id}
                          data-col={c.id}
                          className={cn(
                            "overflow-hidden",
                            c.align === "right" && "text-right",
                            c.id === "date" && "text-muted-foreground tabular-nums",
                            c.id === "amount" && "tabular-nums",
                          )}
                        >
                          <CellContent align={c.align}>
                            <MovementCell column={c.id} {...ctx} />
                          </CellContent>
                        </TableCell>
                      ))}
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <PayNextButton movement={m} kind={itemKind} />
                          <MovementRowActions
                            movement={m}
                            kind={itemKind}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            deleting={deletingId === m.id}
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
                        kind={itemKind}
                        cardId={m.creditCardId}
                        columns={visibleIds}
                      />
                    )}
                  </Fragment>
                )
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
