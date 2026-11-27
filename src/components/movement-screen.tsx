import { Suspense } from "react"

import { MovementColumnsMenu } from "@/components/movement-columns-menu"
import { MovementFilters, MovementFiltersSkeleton } from "@/components/movement-filters"
import { MovementList, MovementListSkeleton } from "@/components/movement-list"
import { MovementPagination } from "@/components/movement-pagination"
import { NewMovementButton, NewMovementProvider } from "@/components/new-movement-button"
import { MovementStatusPills, MovementTotalsBar } from "@/components/movement-status-pills"
import { todayInAr, type IsoDate } from "@/lib/dates"
import { groupModeFor } from "@/lib/movement-list-view"
import {
  defaultSortForKind,
  hayFiltrosActivos,
  parseMovementQuery,
  type MovementQuery,
} from "@/lib/movement-query"
import { BASE_PATHS } from "@/lib/movement-routes"
import {
  listCardOptions,
  listDescriptionSuggestions,
} from "@/server/card-queries"
import {
  listCategories,
  queryMovementsView,
} from "@/server/queries"
import { requireSettings } from "@/server/session"

type Kind = "income" | "expense"

type Props = {
  kind: Kind
  searchParams: Record<string, string | string[] | undefined>
}

async function BarraDeFiltros({
  kind,
  query,
  today,
}: {
  kind: Kind
  query: MovementQuery
  today: IsoDate
}) {
  const { user } = await requireSettings()
  // Sin `await`: el diálogo las espera solo, la barra no.
  const suggestions = listDescriptionSuggestions(user.id, kind)
  const [categories, cards] = await Promise.all([
    listCategories(user.id, kind, true),
    kind === "expense" ? listCardOptions(user.id, today) : Promise.resolve([]),
  ])

  return (
    <NewMovementProvider
      kind={kind}
      categories={categories}
      cards={cards}
      today={today}
      suggestions={suggestions}
    >
      <MovementFilters
        basePath={BASE_PATHS[kind]}
        query={query}
        defaultSort={defaultSortForKind(kind)}
        today={today}
        categories={categories}
        cards={cards}
        showPaymentMethod={kind === "expense"}
        layout="toolbar"
        mobileAction={<NewMovementButton />}
        trailing={
          <>
            <MovementColumnsMenu kind={kind} />
            <NewMovementButton />
          </>
        }
      />
    </NewMovementProvider>
  )
}

async function ListaConPaginacion({
  kind,
  query,
  today,
}: {
  kind: Kind
  query: MovementQuery
  today: IsoDate
}) {
  const { user } = await requireSettings()
  const defaultSort = defaultSortForKind(kind)

  const [categories, cards, vista] = await Promise.all([
    listCategories(user.id, kind, true),
    kind === "expense" ? listCardOptions(user.id, today) : Promise.resolve([]),
    queryMovementsView(user.id, kind, query, today),
  ])

  const { items, page, totalPages, totalCount, statusCounts, totals } = vista
  const filtered = hayFiltrosActivos(query)
  const emptyMessage = filtered
    ? "Ningún movimiento entra en el filtro."
    : kind === "income"
      ? "Todavía no cargaste ningún ingreso."
      : "Todavía no cargaste ningún egreso."

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <MovementStatusPills
          basePath={BASE_PATHS[kind]}
          query={query}
          defaultSort={defaultSort}
          counts={statusCounts}
        />
        <MovementTotalsBar totals={totals} />
      </div>

      <MovementList
        movements={items}
        categories={categories}
        cards={cards}
        today={today}
        emptyMessage={emptyMessage}
        hasActiveFilters={filtered}
        basePath={BASE_PATHS[kind]}
        kind={kind}
        groupBy={groupModeFor(kind, query.sort, query.dir)}
        query={query}
        defaultSort={defaultSort}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
      />

      <MovementPagination
        basePath={BASE_PATHS[kind]}
        query={query}
        defaultSort={defaultSort}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
      />
    </div>
  )
}

export function MovementScreen({ kind, searchParams }: Props) {
  const defaultSort = defaultSortForKind(kind)
  const query = parseMovementQuery(searchParams, defaultSort)
  const today = todayInAr()

  return (
    <div className="space-y-6">
      <Suspense fallback={<MovementFiltersSkeleton layout="toolbar" />}>
        <BarraDeFiltros kind={kind} query={query} today={today} />
      </Suspense>

      <Suspense fallback={<MovementListSkeleton />}>
        <ListaConPaginacion kind={kind} query={query} today={today} />
      </Suspense>
    </div>
  )
}
