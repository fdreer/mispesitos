"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { CreditCard } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { DeleteMovementDialog } from "@/components/delete-movement-button"
import { InstallmentRows } from "@/components/installment-rows"
import { MovementFormDialog } from "@/components/movement-form-dialog"
import {
  MovementRowActions,
  nextInstallmentText,
  PayNextButton,
} from "@/components/movement-row-actions"
import { MovementStatusBadge } from "@/components/movement-cells"
import { MovementTable } from "@/components/movement-table"
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
  type MovementGroup,
  type MovementGroupMode,
  type MovementSort,
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
  /** Orden por defecto de la pantalla: el tercer click en un encabezado vuelve acá. */
  defaultSort?: MovementSort
  page?: number
  totalPages?: number
  totalCount?: number
}

const SKELETON_COLUMNS = ["Fecha", "Descripción", "Categoría", "Importe", "Estado"] as const

function SkeletonTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-8" />
        {SKELETON_COLUMNS.map((c) => (
          <TableHead key={c} className="text-xs text-muted-foreground">
            {c}
          </TableHead>
        ))}
        <TableHead>
          <span className="sr-only">Acciones</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  )
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
  groups,
  cardNameById,
  categoryLabel,
  today,
  expanded,
  toggle,
  onEdit,
  onDelete,
  deletingId,
}: {
  groups: MovementGroup<MovementWithInstallments>[]
  cardNameById: Map<string, string>
  categoryLabel: Map<string, CategoryLabel>
  today: IsoDate
  expanded: Set<string>
  toggle: (id: string) => void
  onEdit: (movement: MovementWithInstallments, kind: "income" | "expense") => void
  onDelete: (movement: MovementWithInstallments) => void
  deletingId: string | null
}) {
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
            const cardName = m.creditCardId ? cardNameById.get(m.creditCardId) : undefined

            return (
              <article
                key={m.id}
                aria-label={m.description}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
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
                      onEdit={onEdit}
                      onDelete={onDelete}
                      deleting={deletingId === m.id}
                    />
                  </span>
                </div>

                {isOpen && (
                  <div id={detailsId} className="mt-3">
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
  defaultSort,
  page = 1,
  totalPages = 1,
  totalCount,
}: Props) {
  const categoryLabel = useMemo(() => categoryLabels(categories), [categories])
  const cardNameById = useMemo(() => new Map(cards.map((c) => [c.id, c.name])), [cards])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [extraMovements, setExtraMovements] = useState<MovementWithInstallments[]>([])
  const [loadedPage, setLoadedPage] = useState(page)
  const [lastInitialMovements, setLastInitialMovements] = useState(movements)
  const [lastPage, setLastPage] = useState(page)
  const [loadingMore, startLoadMore] = useTransition()
  const [editing, setEditing] = useState<{
    movement: MovementWithInstallments
    kind: "income" | "expense"
  } | null>(null)
  const [deleting, setDeleting] = useState<MovementWithInstallments | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Si llegan movimientos nuevos del servidor (cambio de filtro, recarga o
  // acción), reinicia el acumulado de "Cargar más" en móvil.
  if (movements !== lastInitialMovements || page !== lastPage) {
    setLastInitialMovements(movements)
    setLastPage(page)
    setExtraMovements([])
    setLoadedPage(page)
  }

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleEdit = useCallback(
    (movement: MovementWithInstallments, itemKind: "income" | "expense") => {
      setEditing({ movement, kind: itemKind })
    },
    [],
  )

  const handleDelete = useCallback((movement: MovementWithInstallments) => {
    setDeleting(movement)
  }, [])

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

  const paidGroupLabel = kind === "income" ? "Cobrados" : "Pagados"
  const desktopGroups = useMemo(
    () => groupMovements(movements, groupBy, today, paidGroupLabel),
    [movements, groupBy, today, paidGroupLabel],
  )
  const mobileMovements = useMemo(
    () => (extraMovements.length === 0 ? movements : [...movements, ...extraMovements]),
    [movements, extraMovements],
  )
  const mobileGroups = useMemo(
    () =>
      extraMovements.length === 0
        ? desktopGroups
        : groupMovements(mobileMovements, groupBy, today, paidGroupLabel),
    [extraMovements.length, desktopGroups, mobileMovements, groupBy, today, paidGroupLabel],
  )

  if (movements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.08] px-4 py-12 text-center">
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
              today={today}
              triggerLabel={kind === "income" ? "Cargar primer ingreso" : "Cargar primer egreso"}
            />
          )
        )}
      </div>
    )
  }

  const tableKind = kind ?? assertInstallmentMovementKind(movements[0].kind)
  const canLoadMore = Boolean(kind && query && loadedPage < totalPages)

  return (
    <>
      <div className="hidden md:block">
        <MovementTable
          kind={tableKind}
          groups={desktopGroups}
          categories={categories}
          categoryLabel={categoryLabel}
          cardNameById={cardNameById}
          today={today}
          expanded={expanded}
          toggle={toggle}
          onEdit={handleEdit}
          onDelete={handleDelete}
          deletingId={deletingId}
          basePath={basePath}
          query={query}
          defaultSort={defaultSort}
        />
      </div>

      <MovementCards
        groups={mobileGroups}
        cardNameById={cardNameById}
        categoryLabel={categoryLabel}
        today={today}
        expanded={expanded}
        toggle={toggle}
        onEdit={handleEdit}
        onDelete={handleDelete}
        deletingId={deletingId}
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
            className="h-10 w-full"
            disabled={loadingMore}
            onClick={handleLoadMore}
          >
            {loadingMore ? "Cargando..." : "Cargar más"}
          </Button>
        </div>
      )}

      {editing && (
        <MovementFormDialog
          kind={editing.kind}
          categories={categories}
          today={today}
          movement={editing.movement}
          cards={cards}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
        />
      )}

      {deleting && (
        <DeleteMovementDialog
          id={deleting.id}
          description={deleting.description}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          onPendingChange={(p) => setDeletingId(p ? deleting.id : null)}
        />
      )}
    </>
  )
}

export function MovementListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <SkeletonTableHeader />
          <TableBody>
            {Array.from({ length: rows }, (_, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                <TableCell />
                {SKELETON_COLUMNS.map((c) => (
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
          <div key={i} className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
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
