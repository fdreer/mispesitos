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
export const STATUS_VALUES: readonly MovementStatus[] = ["pending", "paid", "overdue"]

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

/**
 * Cada filtro con el valor que significa "sin filtro". Es LA lista: de acá
 * salen las tres decisiones que antes vivían cada una por su cuenta —qué se
 * escribe en la URL (`buildMovementHref`), qué cuenta como pantalla filtrada
 * (`hayFiltrosActivos`) y qué viaja a la consulta (`movementFiltersFromQuery`)—
 * y que ya no pueden discrepar entre sí. Agregar un filtro nuevo sigue pidiendo
 * tocar `MovementQuery`, el parser y la barra, pero olvidarse de uno de estos
 * tres lugares —que era lo que fallaba en silencio— ya no es posible.
 *
 * `page` no está: no es un filtro, es dónde estás parado dentro del resultado.
 */
export const FILTER_DEFAULTS = {
  search: "",
  categoryId: "all",
  status: "all",
  from: "",
  to: "",
} as const

type FilterKey = keyof typeof FILTER_DEFAULTS

const FILTER_KEYS = Object.keys(FILTER_DEFAULTS) as FilterKey[]

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
    categoryId: one(raw.categoryId) || FILTER_DEFAULTS.categoryId,
    status: (STATUS_VALUES as readonly string[]).includes(status)
      ? (status as MovementStatus)
      : FILTER_DEFAULTS.status,
    from: isValidIsoDate(from) ? from : FILTER_DEFAULTS.from,
    to: isValidIsoDate(to) ? to : FILTER_DEFAULTS.to,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/**
 * Si hay algún filtro puesto (la página no cuenta). `movement-screen.tsx`
 * la usa para elegir el mensaje de lista vacía y `movement-filters.tsx` para
 * decidir si ofrece "Limpiar".
 */
export function hayFiltrosActivos(query: MovementQuery): boolean {
  return FILTER_KEYS.some((k) => query[k] !== FILTER_DEFAULTS[k])
}

/**
 * Los filtros que entiende la consulta (`listMovements`, `listMovementsPage`),
 * con `undefined` donde no hay filtro. `kind` no sale de acá: lo pone la
 * pantalla, no la URL.
 *
 * El estado tampoco viaja, y no es un olvido: no es una columna de la base,
 * se deriva de las cuotas. Quien filtra por estado corta en memoria después
 * (ver `ListaConPaginacion` en `movement-screen.tsx`).
 */
export function movementFiltersFromQuery(query: MovementQuery): {
  search?: string
  categoryId?: string
  from?: string
  to?: string
} {
  const puesto = <K extends FilterKey>(k: K) =>
    query[k] === FILTER_DEFAULTS[k] ? undefined : query[k]

  return {
    search: puesto("search"),
    categoryId: puesto("categoryId"),
    from: puesto("from"),
    to: puesto("to"),
  }
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
  for (const k of FILTER_KEYS) {
    if (next[k] !== FILTER_DEFAULTS[k]) params.set(k, next[k])
  }
  if (next.page > 1) params.set("page", String(next.page))

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
