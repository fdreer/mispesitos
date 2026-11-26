import { Suspense } from "react"
import { Plus } from "lucide-react"

import { MovementFilters, MovementFiltersSkeleton } from "@/components/movement-filters"
import { MovementFormDialog } from "@/components/movement-form-dialog"
import { MovementList, MovementListSkeleton } from "@/components/movement-list"
import { MovementPagination } from "@/components/movement-pagination"
import { MovementStatusPills, MovementTotalsBar } from "@/components/movement-status-pills"
import { buttonVariants } from "@/components/ui/button"
import { todayInAr, type IsoDate } from "@/lib/dates"
import { groupModeFor } from "@/lib/movement-list-view"
import {
  defaultSortForKind,
  hayFiltrosActivos,
  parseMovementQuery,
  type MovementQuery,
} from "@/lib/movement-query"
import { BASE_PATHS } from "@/lib/movement-routes"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { cn } from "@/lib/utils"
import {
  listCardOptions,
  listDescriptionSuggestions,
  type CardOption,
  type DescriptionSuggestion,
} from "@/server/card-queries"
import {
  listCategories,
  queryMovementsView,
  type Category,
} from "@/server/queries"
import { requireSettings } from "@/server/session"

const TITLES: Record<"income" | "expense", string> = {
  income: "Ingresos",
  expense: "Egresos",
}

type Kind = "income" | "expense"

type Props = {
  kind: Kind
  searchParams: Record<string, string | string[] | undefined>
}

async function MovementFormDialogWithRate({
  kind,
  categories,
  cards,
  suggestions,
  today,
  ratePreference,
}: {
  kind: Kind
  categories: Category[]
  cards: CardOption[]
  suggestions: DescriptionSuggestion[]
  today: IsoDate
  ratePreference: RatePreference
}) {
  const rate = await fetchSuggestedRate(ratePreference)
  return (
    <MovementFormDialog
      kind={kind}
      categories={categories}
      cards={cards}
      suggestions={suggestions}
      suggestedRate={rate?.referenceRate ?? null}
      today={today}
    />
  )
}

async function BotonNuevo({ kind }: { kind: Kind }) {
  const { user, settings } = await requireSettings()
  const today = todayInAr()
  const [categories, cards, suggestions] = await Promise.all([
    listCategories(user.id, kind, true),
    kind === "expense" ? listCardOptions(user.id, today) : Promise.resolve([]),
    listDescriptionSuggestions(user.id, kind),
  ])

  return (
    <Suspense
      fallback={
        <MovementFormDialog
          kind={kind}
          categories={categories}
          cards={cards}
          suggestions={suggestions}
          suggestedRate={null}
          today={today}
        />
      }
    >
      <MovementFormDialogWithRate
        kind={kind}
        categories={categories}
        cards={cards}
        suggestions={suggestions}
        today={today}
        ratePreference={settings.preferredRate as RatePreference}
      />
    </Suspense>
  )
}

function BotonNuevoSkeleton() {
  return (
    <div aria-hidden className={cn(buttonVariants(), "pointer-events-none opacity-50")}>
      <Plus />
      Nuevo
    </div>
  )
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
  const [categories, cards] = await Promise.all([
    listCategories(user.id, kind, true),
    kind === "expense" ? listCardOptions(user.id, today) : Promise.resolve([]),
  ])

  return (
    <MovementFilters
      basePath={BASE_PATHS[kind]}
      query={query}
      defaultSort={defaultSortForKind(kind)}
      today={today}
      categories={categories}
      cards={cards}
      showPaymentMethod={kind === "expense"}
    />
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
        groupBy={groupModeFor(kind, query.sort)}
        query={query}
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-paper">{TITLES[kind]}</h1>
        <Suspense fallback={<BotonNuevoSkeleton />}>
          <BotonNuevo kind={kind} />
        </Suspense>
      </div>

      <Suspense fallback={<MovementFiltersSkeleton showPaymentMethod={kind === "expense"} />}>
        <BarraDeFiltros kind={kind} query={query} today={today} />
      </Suspense>

      <Suspense fallback={<MovementListSkeleton />}>
        <ListaConPaginacion kind={kind} query={query} today={today} />
      </Suspense>
    </div>
  )
}
