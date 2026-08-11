import { Suspense } from "react"

import { MovementFilters } from "@/components/movement-filters"
import { MovementFormDialog } from "@/components/movement-form-dialog"
import { MovementList } from "@/components/movement-list"
import { MovementPagination } from "@/components/movement-pagination"
import { todayInAr, type IsoDate } from "@/lib/dates"
import { paginate, parseMovementQuery } from "@/lib/movement-query"
import { BASE_PATHS } from "@/lib/movement-routes"
import { getMovementStatus } from "@/lib/movement-status"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listCategories, listMovements, type Category } from "@/server/queries"
import { requireSettings } from "@/server/session"

const TITLES: Record<"income" | "expense", string> = {
  income: "Ingresos",
  expense: "Egresos",
}

type Props = {
  kind: "income" | "expense"
  /** Los search params crudos de la URL, tal como llegan del page.tsx. */
  searchParams: Record<string, string | string[] | undefined>
}

/**
 * La cotización sugerida sale de dolarapi, que en el peor caso tarda hasta
 * 3s (ver TIMEOUT_MS en @/lib/rate) antes de resolver a null. Separada en su
 * propio componente async y detrás de un Suspense: así esa espera no bloquea
 * el resto de la pantalla, que no depende de ella para pintar.
 */
async function MovementFormDialogWithRate({
  kind,
  categories,
  today,
  ratePreference,
}: {
  kind: "income" | "expense"
  categories: Category[]
  today: IsoDate
  ratePreference: RatePreference
}) {
  const rate = await fetchSuggestedRate(ratePreference)
  return (
    <MovementFormDialog
      kind={kind}
      categories={categories}
      suggestedRate={rate?.referenceRate ?? null}
      today={today}
    />
  )
}

/**
 * Cuerpo compartido de /ingresos y /egresos: sólo cambia `kind`. Ver
 * TITLES/BASE_PATHS de acá arriba para el resto de la diferencia.
 */
export async function MovementScreen({ kind, searchParams }: Props) {
  const { user, settings } = await requireSettings()
  const today = todayInAr()
  const query = parseMovementQuery(searchParams)

  // Dos consultas de categorías a propósito, no una: el desplegable de carga
  // (MovementForm) no debe ofrecer una categoría archivada, pero la lista
  // (MovementList) arma el nombre de la categoría de CADA movimiento —viejo
  // incluido— y una categoría archivada tiene que seguir resolviendo su nombre
  // ahí. Si las dos pantallas compartieran la misma lista "sólo activas",
  // archivar una categoría haría que los movimientos que la usaban pasen a
  // mostrar "—". El filtro usa la lista completa por el mismo motivo.
  const [activeCategories, allCategories, movements] = await Promise.all([
    listCategories(user.id, kind),
    listCategories(user.id, kind, true),
    listMovements(user.id, {
      kind,
      search: query.search || undefined,
      categoryId: query.categoryId === "all" ? undefined : query.categoryId,
      from: query.from || undefined,
      to: query.to || undefined,
    }),
  ])

  // El estado no es columna de la base: se deriva de las cuotas. Por eso se
  // filtra acá y no en el WHERE, y por eso la paginación va después y no con
  // un LIMIT: un LIMIT en la consulta no sabría cuántas filas van a sobrevivir
  // a este filtro.
  const filtered =
    query.status === "all"
      ? movements
      : movements.filter((m) => getMovementStatus(m.installments, today) === query.status)

  const { items, page, totalPages } = paginate(filtered, query.page)

  const hayFiltros =
    query.search !== "" ||
    query.categoryId !== "all" ||
    query.status !== "all" ||
    query.from !== "" ||
    query.to !== ""

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-paper">{TITLES[kind]}</h1>
        <Suspense
          fallback={
            <MovementFormDialog
              kind={kind}
              categories={activeCategories}
              suggestedRate={null}
              today={today}
            />
          }
        >
          <MovementFormDialogWithRate
            kind={kind}
            categories={activeCategories}
            today={today}
            ratePreference={settings.preferredRate as RatePreference}
          />
        </Suspense>
      </div>

      <MovementFilters
        basePath={BASE_PATHS[kind]}
        query={query}
        categories={allCategories}
      />

      <MovementList
        movements={items}
        categories={allCategories}
        today={today}
        emptyMessage={
          hayFiltros ? "Ningún movimiento entra en el filtro." : "Todavía no cargaste nada acá."
        }
      />

      <MovementPagination
        basePath={BASE_PATHS[kind]}
        query={query}
        page={page}
        totalPages={totalPages}
      />
    </div>
  )
}
