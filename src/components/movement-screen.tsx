import { Suspense } from "react"
import { Plus } from "lucide-react"

import { MovementFilters, MovementFiltersSkeleton } from "@/components/movement-filters"
import { MovementFormDialog } from "@/components/movement-form-dialog"
import { MovementList, MovementListSkeleton } from "@/components/movement-list"
import { MovementPagination } from "@/components/movement-pagination"
import { buttonVariants } from "@/components/ui/button"
import { todayInAr, type IsoDate } from "@/lib/dates"
import {
  hayFiltrosActivos,
  paginate,
  parseMovementQuery,
  type MovementQuery,
} from "@/lib/movement-query"
import { BASE_PATHS } from "@/lib/movement-routes"
import { getMovementStatus } from "@/lib/movement-status"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listCategories, listMovements, type Category } from "@/server/queries"
import { requireSettings } from "@/server/session"
import { cn } from "@/lib/utils"

const TITLES: Record<"income" | "expense", string> = {
  income: "Ingresos",
  expense: "Egresos",
}

type Kind = "income" | "expense"

type Props = {
  kind: Kind
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
  kind: Kind
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
 * El botón "Nuevo" con su diálogo. Dos consultas de categorías a propósito,
 * no una: este desplegable no debe ofrecer una categoría archivada, pero la
 * tabla y el filtro sí las necesitan (ver `ListaConPaginacion`).
 */
async function BotonNuevo({ kind }: { kind: Kind }) {
  const { user, settings } = await requireSettings()
  const categories = await listCategories(user.id, kind)
  const today = todayInAr()

  return (
    <Suspense
      fallback={
        <MovementFormDialog
          kind={kind}
          categories={categories}
          suggestedRate={null}
          today={today}
        />
      }
    >
      <MovementFormDialogWithRate
        kind={kind}
        categories={categories}
        today={today}
        ratePreference={settings.preferredRate as RatePreference}
      />
    </Suspense>
  )
}

/**
 * El lugar del botón mientras viajan las categorías. Un `div` con las clases
 * del botón y no un `<Button disabled>`: no tiene que ser enfocable ni que un
 * lector de pantalla lo anuncie como una acción que existe pero no anda —
 * todavía no es un botón, es el hueco donde va a haber uno.
 */
function BotonNuevoSkeleton() {
  return (
    <div aria-hidden className={cn(buttonVariants(), "pointer-events-none opacity-50")}>
      <Plus />
      Nuevo
    </div>
  )
}

/**
 * La barra de filtros. Necesita la lista COMPLETA de categorías (archivadas
 * incluidas): un movimiento viejo puede apuntar a una categoría ya archivada y
 * tiene que poder filtrarse por ella igual.
 */
async function BarraDeFiltros({ kind, query }: { kind: Kind; query: MovementQuery }) {
  const { user } = await requireSettings()
  const categories = await listCategories(user.id, kind, true)

  return <MovementFilters basePath={BASE_PATHS[kind]} query={query} categories={categories} />
}

/**
 * La parte cara de la pantalla: `listMovements` se trae los movimientos que
 * pasan el filtro MÁS todas sus cuotas, sin LIMIT (ver más abajo por qué no
 * puede tenerlo). Es la única consulta de acá que crece con el historial, y
 * por eso es la que va detrás de su propio Suspense.
 *
 * La misma lista completa de categorías que pide `BarraDeFiltros`: la tabla
 * arma el nombre de la categoría de CADA movimiento —viejo incluido—, así que
 * una archivada tiene que seguir resolviendo su nombre acá. Si las dos
 * pantallas compartieran una lista "sólo activas", archivar una categoría
 * haría que los movimientos que la usaban pasen a mostrar "—". Las dos ramas
 * llaman con los mismos argumentos y `listCategories` está memoizada por
 * request, así que es una sola consulta y no dos.
 */
async function ListaConPaginacion({ kind, query }: { kind: Kind; query: MovementQuery }) {
  const { user } = await requireSettings()
  const today = todayInAr()

  const [categories, movements] = await Promise.all([
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

  return (
    <>
      <MovementList
        movements={items}
        categories={categories}
        today={today}
        emptyMessage={
          hayFiltrosActivos(query)
            ? "Ningún movimiento entra en el filtro."
            : "Todavía no cargaste nada acá."
        }
      />

      <MovementPagination
        basePath={BASE_PATHS[kind]}
        query={query}
        page={page}
        totalPages={totalPages}
      />
    </>
  )
}

/**
 * Cuerpo compartido de /ingresos y /egresos: sólo cambia `kind`. Ver
 * TITLES/BASE_PATHS de acá arriba para el resto de la diferencia.
 *
 * NO es `async`, y eso es lo que hace que la pantalla llegue por partes: si
 * esperara acá arriba a la sesión y a las tres consultas —como hacía antes—,
 * el servidor no puede mandar UN SOLO byte del HTML hasta que la más lenta
 * termine, y hasta entonces lo único que se ve es el esqueleto genérico de
 * `(app)/loading.tsx`, que no se parece a esta pantalla. Devolviendo sin
 * esperar nada, el título y la estructura salen en el primer flush y cada
 * `Suspense` de acá abajo se completa cuando su propia consulta llega:
 *
 *   1. el título, ya (no depende de nada);
 *   2. el botón "Nuevo" y los filtros, apenas vuelven las categorías;
 *   3. la tabla, cuando vuelven los movimientos con sus cuotas.
 *
 * `query` se parsea acá y se pasa a las tres ramas en vez de que cada una lo
 * haga por su cuenta: sale de la URL, no de la base, así que no hay nada que
 * esperar y las tres tienen que estar mirando exactamente el mismo filtro.
 *
 * Ojo al verificar esto con un navegador automatizado: React revela los
 * Suspense desde `requestAnimationFrame`, que no dispara en una pestaña de
 * fondo. Con la pestaña oculta los esqueletos se quedan puestos para siempre
 * y parece un bug de la app. Está documentado en docs/PENDIENTES.md §3.4.
 */
export function MovementScreen({ kind, searchParams }: Props) {
  const query = parseMovementQuery(searchParams)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-paper">{TITLES[kind]}</h1>
        <Suspense fallback={<BotonNuevoSkeleton />}>
          <BotonNuevo kind={kind} />
        </Suspense>
      </div>

      <Suspense fallback={<MovementFiltersSkeleton />}>
        <BarraDeFiltros kind={kind} query={query} />
      </Suspense>

      <Suspense fallback={<MovementListSkeleton />}>
        <ListaConPaginacion kind={kind} query={query} />
      </Suspense>
    </div>
  )
}
