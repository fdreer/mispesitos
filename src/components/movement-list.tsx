"use client"

import { Fragment, useState, useTransition } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, CreditCard } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { InstallmentRows, InstallmentTableRows } from "@/components/installment-rows"
import { MovementFormDialog } from "@/components/movement-form-dialog"
import {
  MovementRowActions,
  nextInstallmentText,
  PayNextButton,
} from "@/components/movement-row-actions"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { categoryLabels, type CategoryLabel } from "@/lib/category-tree"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { assertCurrency, assertInstallmentMovementKind } from "@/lib/movement-asserts"
import {
  groupMovements,
  pluralize,
  type MovementGroupMode,
} from "@/lib/movement-list-view"
import type { MovementQuery } from "@/lib/movement-query"
import { summarizeMovementStatus } from "@/lib/movement-status"
import { fetchMovementListPage } from "@/server/actions/movements"
import type { CardOption } from "@/server/card-queries"
import type { Category, MovementWithInstallments } from "@/server/queries"

type Props = {
  movements: MovementWithInstallments[]
  categories: Category[]
  cards?: CardOption[]
  today: IsoDate
  emptyMessage: string
  hasActiveFilters?: boolean
  basePath?: string
  kind?: "income" | "expense"
  groupBy?: MovementGroupMode
  query?: MovementQuery
  page?: number
  totalPages?: number
  totalCount?: number
}

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

function CardName({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CreditCard className="size-3.5" aria-hidden />
      {name}
    </span>
  )
}

function MovementCards({
  movements,
  categories,
  cards,
  categoryLabel,
  today,
  expanded,
  toggle,
  groupBy,
  paidGroupLabel,
}: {
  movements: MovementWithInstallments[]
  categories: Category[]
  cards: CardOption[]
  categoryLabel: Map<string, CategoryLabel>
  today: IsoDate
  expanded: Set<string>
  toggle: (id: string) => void
  groupBy: MovementGroupMode
  paidGroupLabel: string
}) {
  const groups = groupMovements(movements, groupBy, today, paidGroupLabel)

  return (
    <div className="space-y-4 md:hidden">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          {group.label && (
            <h2 className="text-xs font-medium text-muted-foreground">
              {group.label} · {group.items.length}
            </h2>
          )}
          {group.items.map((m) => {
            const summary = summarizeMovementStatus(m.installments, today)
            const currency = assertCurrency(m.currency)
            const kind = assertInstallmentMovementKind(m.kind)
            const isOpen = expanded.has(m.id)
            const categoria = m.categoryId ? categoryLabel.get(m.categoryId) : undefined
            const detailsId = `cuotas-${m.id}`
            const nextText = nextInstallmentText(m, today)
            const cardName = m.creditCardId
              ? cards.find((c) => c.id === m.creditCardId)?.name
              : undefined

            return (
              <article
                key={m.id}
                aria-label={m.description}
                className="rounded-lg border border-border bg-background p-3"
              >
                <button
                  type="button"
                  className="flex min-h-11 w-full items-start justify-between gap-3 text-left"
                  aria-label={`${isOpen ? "Ocultar" : "Ver"} cuotas de ${m.description}`}
                  aria-expanded={isOpen}
                  aria-controls={detailsId}
                  onClick={() => toggle(m.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {m.description}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {formatIsoForDisplay(m.date)}
                      {m.installments.length > 1 && <span>· {m.installments.length} cuotas</span>}
                    </span>
                    {cardName && <CardName name={cardName} />}
                  </span>
                  <span className="shrink-0 text-right tabular-nums font-medium text-foreground">
                    {formatMoney(m.amountCents, currency)}
                  </span>
                </button>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <span>{categoria ? <CategoryBadge {...categoria} /> : "—"}</span>
                  <MovementStatusBadge {...summary} />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{nextText}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <PayNextButton movement={m} kind={kind} />
                    <MovementRowActions
                      movement={m}
                      kind={kind}
                      categories={categories}
                      cards={cards}
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
                      cardId={m.creditCardId}
                    />
                  </div>
                )}
              </article>
            )
          })}
        </section>
      ))}
    </div>
  )
}

export function MovementList({
  movements,
  categories,
  cards = [],
  today,
  emptyMessage,
  hasActiveFilters = false,
  basePath,
  kind,
  groupBy = "none",
  query,
  page = 1,
  totalPages = 1,
  totalCount,
}: Props) {
  const categoryLabel = categoryLabels(categories)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [extraMovements, setExtraMovements] = useState<MovementWithInstallments[]>([])
  const [loadedPage, setLoadedPage] = useState(page)
  const [lastInitialMovements, setLastInitialMovements] = useState(movements)
  const [lastPage, setLastPage] = useState(page)
  const [loadingMore, startLoadMore] = useTransition()

  // Si llegan movimientos nuevos del servidor (cambio de filtro, recarga o
  // acción), reinicia el acumulado de "Cargar más" en móvil.
  if (movements !== lastInitialMovements || page !== lastPage) {
    setLastInitialMovements(movements)
    setLastPage(page)
    setExtraMovements([])
    setLoadedPage(page)
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleLoadMore() {
    if (!kind || !query || loadedPage >= totalPages) return
    const nextPage = loadedPage + 1
    startLoadMore(async () => {
      const res = await fetchMovementListPage(kind, query, nextPage)
      setExtraMovements((prev) => {
        const seen = new Set([...movements, ...prev].map((m) => m.id))
        return [...prev, ...res.items.filter((m) => !seen.has(m.id))]
      })
      setLoadedPage(res.page)
    })
  }

  if (movements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-10 text-center">
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        {hasActiveFilters && basePath ? (
          <Button asChild variant="outline">
            <Link href={basePath}>Limpiar filtros</Link>
          </Button>
        ) : (
          kind && (
            <MovementFormDialog
              kind={kind}
              categories={categories}
              cards={cards}
              suggestedRate={null}
              today={today}
              triggerLabel={kind === "income" ? "Cargar primer ingreso" : "Cargar primer egreso"}
            />
          )
        )}
      </div>
    )
  }

  const paidGroupLabel = kind === "income" ? "Cobrados" : "Pagados"
  const desktopGroups = groupMovements(movements, groupBy, today, paidGroupLabel)
  const mobileMovements = [...movements, ...extraMovements]
  const canLoadMore = Boolean(kind && query && loadedPage < totalPages)

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <MovementTableHeader />
          <TableBody>
            {desktopGroups.map((group) => (
              <Fragment key={group.key}>
                {group.label && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell
                      colSpan={7}
                      className="py-1.5 text-xs font-medium text-muted-foreground"
                    >
                      {group.label} · {group.items.length}
                    </TableCell>
                  </TableRow>
                )}
                {group.items.map((m) => {
                  const summary = summarizeMovementStatus(m.installments, today)
                  const currency = assertCurrency(m.currency)
                  const itemKind = assertInstallmentMovementKind(m.kind)
                  const isOpen = expanded.has(m.id)
                  const categoria = m.categoryId ? categoryLabel.get(m.categoryId) : undefined
                  const nextText = nextInstallmentText(m, today)
                  const cardName = m.creditCardId
                    ? cards.find((c) => c.id === m.creditCardId)?.name
                    : undefined

                  return (
                    <Fragment key={m.id}>
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
                            <span className="text-muted-foreground">
                              {" "}
                              · {m.installments.length} cuotas
                            </span>
                          )}
                          {nextText && (
                            <span className="block text-xs text-muted-foreground">{nextText}</span>
                          )}
                          {cardName && (
                            <span className="block">
                              <CardName name={cardName} />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {categoria ? <CategoryBadge {...categoria} /> : "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatMoney(m.amountCents, currency)}
                        </TableCell>
                        <TableCell>
                          <MovementStatusBadge {...summary} />
                        </TableCell>
                        <TableCell
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <PayNextButton movement={m} kind={itemKind} />
                            <MovementRowActions
                              movement={m}
                              kind={itemKind}
                              categories={categories}
                              cards={cards}
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
                          kind={itemKind}
                          cardId={m.creditCardId}
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

      <MovementCards
        movements={mobileMovements}
        categories={categories}
        cards={cards}
        categoryLabel={categoryLabel}
        today={today}
        expanded={expanded}
        toggle={toggle}
        groupBy={groupBy}
        paidGroupLabel={paidGroupLabel}
      />

      {canLoadMore && (
        <div className="flex flex-col items-center gap-2 md:hidden">
          {totalCount !== undefined && (
            <p className="text-muted-foreground text-xs tabular-nums">
              Mostrando {mobileMovements.length} de {totalCount}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            disabled={loadingMore}
            onClick={handleLoadMore}
          >
            {loadingMore ? "Cargando..." : "Cargar más"}
          </Button>
        </div>
      )}
    </>
  )
}

export function MovementListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      <div className="hidden md:block">
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
      </div>
      <div className="space-y-2 md:hidden" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="h-4 w-40 animate-pulse rounded bg-graphite" />
              <div className="h-4 w-20 animate-pulse rounded bg-graphite" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="h-5 w-24 animate-pulse rounded bg-graphite" />
              <div className="h-5 w-20 animate-pulse rounded bg-graphite" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
