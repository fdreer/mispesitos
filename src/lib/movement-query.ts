import { isValidIsoDate } from "@/lib/dates"
import type { MovementStatus } from "@/lib/movement-status"

/** Filas por página en las listas de ingresos y egresos. */
export const PAGE_SIZE = 20

/**
 * Exportada porque el desplegable de estado (`movement-filters.tsx`) arma sus
 * opciones a partir de esta misma lista: si sólo viviera acá adentro, agregar
 * un estado nuevo sin tocar el dropdown lo dejaría aparecer, elegible, y
 * parseando de vuelta a "all" — la lista de abajo y el desplegable son la
 * misma fuente.
 */
export const STATUS_VALUES: MovementStatus[] = ["pending", "paid", "overdue"]

/** El mismo tope que `movementSchema` le pone a la descripción. */
export const SEARCH_MAX = 200

export type MovementQuery = {
  /** Texto libre contra la descripción. "" = sin filtro. */
  search: string
  /** Id de categoría, o "all". */
  categoryId: string
  status: MovementStatus | "all"
  /** ISO yyyy-mm-dd, o "" si no hay borde. */
  from: string
  to: string
  /** 1-based. */
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

/** Next entrega string[] cuando el parámetro viene repetido en la URL. */
function one(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? ""
}

/**
 * Normaliza el query string de /ingresos y /egresos. Todo lo que no entiende
 * cae en el default en vez de propagarse: la URL la escribe cualquiera, y un
 * `?status=borracho` no puede dejar la lista vacía ni tumbar la pantalla.
 */
export function parseMovementQuery(raw: RawParams): MovementQuery {
  const status = one(raw.status)
  const from = one(raw.from)
  const to = one(raw.to)
  const page = Number.parseInt(one(raw.page), 10)

  return {
    search: one(raw.search).trim().slice(0, SEARCH_MAX),
    categoryId: one(raw.categoryId) || "all",
    status: (STATUS_VALUES as string[]).includes(status) ? (status as MovementStatus) : "all",
    from: isValidIsoDate(from) ? from : "",
    to: isValidIsoDate(to) ? to : "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/**
 * Si hay algún filtro puesto (la página no cuenta). `movement-screen.tsx`
 * la usa para elegir el mensaje de lista vacía y `movement-filters.tsx` para
 * decidir si ofrece "Limpiar" — antes cada uno la recalculaba por su cuenta
 * con la misma lista de cinco campos, y agregar un filtro nuevo era editarla
 * en los dos lugares sin que ninguno avisara si te olvidabas de uno.
 */
export function hayFiltrosActivos(query: MovementQuery): boolean {
  return (
    query.search !== "" ||
    query.categoryId !== "all" ||
    query.status !== "all" ||
    query.from !== "" ||
    query.to !== ""
  )
}

export type Page<T> = {
  items: T[]
  /** La página que realmente se muestra: puede no ser la pedida. */
  page: number
  totalPages: number
}

/**
 * Corta la página pedida. Si se pide una que ya no existe —pasa siempre que un
 * filtro achica la lista con el `?page=` viejo todavía en la URL— devuelve la
 * última en vez de una lista vacía: una tabla en blanco con datos cargados se
 * lee como un bug.
 */
export function paginate<T>(items: T[], page: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const current = Math.min(Math.max(1, page), totalPages)
  const start = (current - 1) * PAGE_SIZE

  return { items: items.slice(start, start + PAGE_SIZE), page: current, totalPages }
}

/**
 * URL de la lista con `patch` aplicado sobre `query`. Lo que está en su default
 * no se escribe: así /ingresos sin filtros sigue siendo /ingresos y no
 * /ingresos?search=&categoryId=all&status=all&page=1.
 *
 * Tocar cualquier filtro resetea la página. Va acá y no en cada llamador
 * porque olvidárselo no rompe nada visible hasta que alguien filtra parado en
 * la página 7 y se encuentra con la tabla vacía.
 */
export function buildMovementHref(
  basePath: string,
  query: MovementQuery,
  patch: Partial<MovementQuery> = {},
): string {
  const cambiaFiltro = Object.keys(patch).some((k) => k !== "page")
  const next: MovementQuery = {
    ...query,
    ...patch,
    page: cambiaFiltro ? 1 : (patch.page ?? query.page),
  }

  const params = new URLSearchParams()
  if (next.search) params.set("search", next.search)
  if (next.categoryId !== "all") params.set("categoryId", next.categoryId)
  if (next.status !== "all") params.set("status", next.status)
  if (next.from) params.set("from", next.from)
  if (next.to) params.set("to", next.to)
  if (next.page > 1) params.set("page", String(next.page))

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
