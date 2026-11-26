import { isValidIsoDate } from "@/lib/dates"
import { parseAmountToCents, roundCents } from "@/lib/money"
import type { MovementSort } from "@/lib/movement-list-view"
import type { MovementStatus } from "@/lib/movement-status"

/** Filas por página en las listas de ingresos y egresos. */
export const PAGE_SIZE = 20

/**
 * Exportada porque las pastillas de estado arman sus opciones a partir de esta
 * misma lista: el filtro y la lista nunca pueden discrepar sobre qué estados
 * existen.
 */
export const STATUS_VALUES: readonly MovementStatus[] = ["pending", "paid", "overdue"]

export const CURRENCY_VALUES = ["ARS", "USD"] as const

export type QueryCurrency = (typeof CURRENCY_VALUES)[number]

export const SORT_VALUES: readonly MovementSort[] = ["due", "date", "amount"]

/** El mismo tope que `movementSchema` le pone a la descripción. */
export const SEARCH_MAX = 200

/** Valor especial de `cardId` para "Efectivo / débito / transferencia". */
export const CARD_FILTER_CASH = "cash"

export type DateField = "date" | "paid"

export type MovementQuery = {
  /** Texto libre contra descripción, categoría o importe. "" = sin filtro. */
  search: string
  /** Ids de categorías seleccionadas (puede incluir padres). `[]` = todas. */
  categoryIds: string[]
  /** Id de tarjeta, `"cash"` (sin tarjeta), o `"all"`. */
  cardId: string
  currency: QueryCurrency | "all"
  status: MovementStatus | "all"
  /** ISO yyyy-mm-dd, o "" si no hay borde. */
  from: string
  to: string
  /**
   * Sobre qué fecha aplican `from`/`to`: `"date"` (fecha del movimiento,
   * default de /ingresos y /egresos) o `"paid"` (fecha de pago de alguna
   * cuota, usado por los enlaces desde /informes para respetar lo percibido).
   */
  dateField: DateField
  /** Importe mínimo y máximo en centavos, o `null` si no hay borde. */
  minCents: number | null
  maxCents: number | null
  /** Orden elegido (`"due"` por defecto en egresos, `"date"` en ingresos). */
  sort: MovementSort
  /** 1-based. */
  page: number
}

/**
 * Cada filtro con el valor que significa "sin filtro". Es LA lista: de acá
 * salen qué se escribe en la URL (`buildMovementHref`), qué cuenta como
 * pantalla filtrada (`hayFiltrosActivos`), el contador de la hoja móvil
 * (`activeFilterCount`) y qué viaja a la consulta (`movementFiltersFromQuery`).
 *
 * `page` y `sort` no están: no filtran filas, sólo el recorte y el orden.
 */
export const FILTER_DEFAULTS = {
  search: "",
  categoryIds: [] as string[],
  cardId: "all",
  currency: "all",
  status: "all",
  from: "",
  to: "",
  dateField: "date" as DateField,
  minCents: null as number | null,
  maxCents: null as number | null,
} as const

type RawParams = Record<string, string | string[] | undefined>

/** Next entrega string[] cuando el parámetro viene repetido en la URL. */
function one(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? ""
}

/**
 * Lee `categoryId` tolerando tanto parámetros repetidos (`?categoryId=a&categoryId=b`)
 * como separados por coma (`?categoryId=a,b`) y la forma vieja (`?categoryId=all`).
 */
function parseCategoryIds(raw: string | string[] | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter((v) => v !== "" && v !== "all")
  return [...new Set(parts)]
}

/**
 * Lee un importe de query string en pesos (p. ej. `min=1500` o `min=1500.5`)
 * y lo pasa a centavos no negativos, o `null` si viene vacío o inválido.
 */
function parseAmountParam(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const cents = parseAmountToCents(trimmed)
  if (cents === null || cents < 0) return null
  return cents
}

/** Serializa centavos a un número corto en pesos para la URL (`150000` -> `"1500"`). */
export function formatAmountParam(cents: number): string {
  const pesos = cents / 100
  return Number.isInteger(pesos) ? String(pesos) : String(roundCents(pesos * 100) / 100)
}

export function defaultSortForKind(kind?: "income" | "expense"): MovementSort {
  return kind === "expense" ? "due" : "date"
}

/**
 * Convierte un `URLSearchParams` en `RawParams` conservando parámetros repetidos
 * como arrays (a diferencia de `Object.fromEntries`, que pisa duplicados).
 */
export function rawParamsFromSearchParams(params: URLSearchParams): RawParams {
  const out: RawParams = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    out[key] = values.length > 1 ? values : values[0]
  }
  return out
}

/**
 * Normaliza el query string de /ingresos y /egresos (y en el futuro /informes).
 * Todo lo que no entiende cae en el default en vez de propagarse.
 */
export function parseMovementQuery(
  raw: RawParams,
  defaultSort: MovementSort = "date",
): MovementQuery {
  const currency = one(raw.currency)
  const status = one(raw.status)
  const from = one(raw.from)
  const to = one(raw.to)
  const por = one(raw.por)
  const sort = one(raw.sort)
  const cardId = one(raw.cardId).trim()
  const page = Number.parseInt(one(raw.page), 10)
  const validFrom = isValidIsoDate(from) ? from : FILTER_DEFAULTS.from
  const validTo = isValidIsoDate(to) ? to : FILTER_DEFAULTS.to

  return {
    search: one(raw.search).trim().slice(0, SEARCH_MAX),
    categoryIds: parseCategoryIds(raw.categoryId),
    cardId: cardId && cardId !== "all" ? cardId : FILTER_DEFAULTS.cardId,
    currency: (CURRENCY_VALUES as readonly string[]).includes(currency)
      ? (currency as QueryCurrency)
      : FILTER_DEFAULTS.currency,
    status: (STATUS_VALUES as readonly string[]).includes(status)
      ? (status as MovementStatus)
      : FILTER_DEFAULTS.status,
    from: validFrom,
    to: validTo,
    dateField: por === "pago" && (validFrom || validTo) ? "paid" : FILTER_DEFAULTS.dateField,
    minCents: parseAmountParam(one(raw.min)),
    maxCents: parseAmountParam(one(raw.max)),
    sort: (SORT_VALUES as readonly string[]).includes(sort) ? (sort as MovementSort) : defaultSort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Si hay algún filtro puesto (la página y el orden no cuentan). */
export function hayFiltrosActivos(query: MovementQuery): boolean {
  return (
    query.search !== FILTER_DEFAULTS.search ||
    query.categoryIds.length > 0 ||
    query.cardId !== FILTER_DEFAULTS.cardId ||
    query.currency !== FILTER_DEFAULTS.currency ||
    query.status !== FILTER_DEFAULTS.status ||
    query.from !== FILTER_DEFAULTS.from ||
    query.to !== FILTER_DEFAULTS.to ||
    query.minCents !== null ||
    query.maxCents !== null
  )
}

/**
 * Cuántos grupos de filtros están activos (para el badge móvil `Filtros (n)`).
 * Incluye el estado (§4: "el contador incluye el estado").
 */
export function activeFilterCount(query: MovementQuery): number {
  return [
    Boolean(query.search),
    query.categoryIds.length > 0,
    query.cardId !== FILTER_DEFAULTS.cardId,
    query.currency !== FILTER_DEFAULTS.currency,
    query.status !== FILTER_DEFAULTS.status,
    Boolean(query.from || query.to),
    query.minCents !== null || query.maxCents !== null,
  ].filter(Boolean).length
}

/**
 * Los filtros que entiende la consulta (`listMovements`, `queryMovementsView`),
 * con `undefined` donde no hay filtro. `kind` no sale de acá: lo pone la
 * pantalla, no la URL.
 */
export function movementFiltersFromQuery(query: MovementQuery): {
  search?: string
  categoryIds?: string[]
  cardId?: string
  currency?: QueryCurrency
  from?: string
  to?: string
  dateField?: DateField
  minCents?: number
  maxCents?: number
} {
  return {
    search: query.search || undefined,
    categoryIds: query.categoryIds.length > 0 ? query.categoryIds : undefined,
    cardId: query.cardId !== FILTER_DEFAULTS.cardId ? query.cardId : undefined,
    currency:
      query.currency !== FILTER_DEFAULTS.currency
        ? (query.currency as QueryCurrency)
        : undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    dateField:
      query.dateField === "paid" && (query.from || query.to) ? "paid" : undefined,
    minCents: query.minCents ?? undefined,
    maxCents: query.maxCents ?? undefined,
  }
}

export type Page<T> = {
  items: T[]
  /** La página que realmente se muestra: puede no ser la pedida. */
  page: number
  totalPages: number
  /** Total de ítems antes de paginar ("21–40 de 134"). */
  totalCount: number
}

/**
 * Corta la página pedida. Si se pide una que ya no existe —pasa siempre que un
 * filtro achica la lista con el `?page=` viejo todavía en la URL— devuelve la
 * última en vez de una lista vacía.
 */
export function paginate<T>(items: T[], page: number): Page<T> {
  const totalCount = items.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const current = Math.min(Math.max(1, page), totalPages)
  const start = (current - 1) * PAGE_SIZE

  return {
    items: items.slice(start, start + PAGE_SIZE),
    page: current,
    totalPages,
    totalCount,
  }
}

/**
 * URL de la lista con `patch` aplicado sobre `query`. Lo que está en su default
 * no se escribe en la URL.
 *
 * Tocar cualquier filtro u orden resetea la página a 1.
 */
export function buildMovementHref(
  basePath: string,
  query: MovementQuery,
  patch: Partial<MovementQuery> = {},
  defaultSort: MovementSort = "date",
  extraParams?: Record<string, string | undefined>,
): string {
  const cambiaFiltroUOrden = Object.keys(patch).some((k) => k !== "page")
  const next: MovementQuery = {
    ...query,
    ...patch,
    page: cambiaFiltroUOrden ? 1 : (patch.page ?? query.page),
  }

  const params = new URLSearchParams()
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v)
    }
  }
  if (next.search !== FILTER_DEFAULTS.search) params.set("search", next.search)
  if (next.categoryIds.length > 0) params.set("categoryId", next.categoryIds.join(","))
  if (next.cardId !== FILTER_DEFAULTS.cardId) params.set("cardId", next.cardId)
  if (next.currency !== FILTER_DEFAULTS.currency) params.set("currency", next.currency)
  if (next.status !== FILTER_DEFAULTS.status) params.set("status", next.status)
  if (next.from !== FILTER_DEFAULTS.from) params.set("from", next.from)
  if (next.to !== FILTER_DEFAULTS.to) params.set("to", next.to)
  if (next.dateField === "paid" && (next.from || next.to)) params.set("por", "pago")
  if (next.minCents !== null) params.set("min", formatAmountParam(next.minCents))
  if (next.maxCents !== null) params.set("max", formatAmountParam(next.maxCents))
  if (next.sort !== defaultSort) params.set("sort", next.sort)
  if (next.page > 1) params.set("page", String(next.page))

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
