import { isValidIsoDate } from "@/lib/dates"
import { parseAmountToCents, roundCents } from "@/lib/money"
import { naturalDir, type MovementSort, type SortDir } from "@/lib/movement-list-view"
import type { MovementStatus } from "@/lib/movement-status"

export const PAGE_SIZE = 20

export const STATUS_VALUES: readonly MovementStatus[] = ["pending", "paid", "overdue"]

export const CURRENCY_VALUES = ["ARS", "USD"] as const

export type QueryCurrency = (typeof CURRENCY_VALUES)[number]

export const SORT_VALUES = ["due", "date", "description", "category", "amount"] as const satisfies readonly MovementSort[]

export const DIR_VALUES = ["asc", "desc"] as const satisfies readonly SortDir[]

export const SEARCH_MAX = 200

export const CARD_FILTER_CASH = "cash"

export type DateField = "date" | "paid"

export type MovementQuery = {
  search: string
  categoryIds: string[]
  cardId: string
  currency: QueryCurrency | "all"
  status: MovementStatus | "all"
  from: string
  to: string
  dateField: DateField
  minCents: number | null
  maxCents: number | null
  sort: MovementSort
  /** Sentido del orden. Si coincide con `naturalDir(sort)` no va a la URL. */
  dir: SortDir
  page: number
}

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

function one(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? ""
}

function parseCategoryIds(raw: string | string[] | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter((v) => v !== "" && v !== "all")
  return [...new Set(parts)]
}

function parseAmountParam(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const cents = parseAmountToCents(trimmed)
  if (cents === null || cents < 0) return null
  return cents
}

export function formatAmountParam(cents: number): string {
  const pesos = cents / 100
  return Number.isInteger(pesos) ? String(pesos) : String(roundCents(pesos * 100) / 100)
}

export function defaultSortForKind(kind?: "income" | "expense"): MovementSort {
  return kind === "expense" ? "due" : "date"
}

export function rawParamsFromSearchParams(params: URLSearchParams): RawParams {
  const out: RawParams = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    out[key] = values.length > 1 ? values : values[0]
  }
  return out
}

export function parseMovementQuery(
  raw: RawParams,
  defaultSort: MovementSort = "date",
): MovementQuery {
  const currency = one(raw.currency)
  const status = one(raw.status)
  const from = one(raw.from)
  const to = one(raw.to)
  const por = one(raw.por)
  const sortRaw = one(raw.sort)
  const dirRaw = one(raw.dir)
  const cardId = one(raw.cardId).trim()
  const page = Number.parseInt(one(raw.page), 10)
  const validFrom = isValidIsoDate(from) ? from : FILTER_DEFAULTS.from
  const validTo = isValidIsoDate(to) ? to : FILTER_DEFAULTS.to
  const sort = (SORT_VALUES as readonly string[]).includes(sortRaw)
    ? (sortRaw as MovementSort)
    : defaultSort

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
    sort,
    dir: (DIR_VALUES as readonly string[]).includes(dirRaw) ? (dirRaw as SortDir) : naturalDir(sort),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

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
  page: number
  totalPages: number
  totalCount: number
}

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
  // Cambiar el orden sin decir el sentido arranca en el natural de ese orden.
  if (patch.sort !== undefined && patch.dir === undefined && patch.sort !== query.sort) {
    next.dir = naturalDir(patch.sort)
  }
  const dir = next.dir ?? naturalDir(next.sort)

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
  if (dir !== naturalDir(next.sort)) params.set("dir", dir)
  if (next.page > 1) params.set("page", String(next.page))

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/**
 * El ciclo del encabezado estilo ClickUp: primer click ordena por la columna en
 * su sentido natural, el segundo lo invierte y el tercero vuelve al orden por
 * defecto de la pantalla.
 */
export function nextHeaderSort(
  query: Pick<MovementQuery, "sort" | "dir">,
  column: MovementSort,
  defaultSort: MovementSort,
): Pick<MovementQuery, "sort" | "dir"> {
  const natural = naturalDir(column)
  if (query.sort !== column) return { sort: column, dir: natural }
  if (query.dir === natural) return { sort: column, dir: natural === "asc" ? "desc" : "asc" }
  return { sort: defaultSort, dir: naturalDir(defaultSort) }
}
