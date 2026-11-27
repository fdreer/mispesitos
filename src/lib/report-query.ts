import { presetRange } from "@/lib/date-presets"
import { addMonthsClamped, monthKey, monthRange, type IsoDate } from "@/lib/dates"
import {
  buildMovementHref,
  FILTER_DEFAULTS,
  parseMovementQuery,
  type MovementQuery,
} from "@/lib/movement-query"

/** El flujo va primero: es el informe principal y el que se abre por defecto. */
export const REPORT_TABS = ["flujo", "ingresos-gastos"] as const
export type ReportTab = (typeof REPORT_TABS)[number]

export const REPORT_CURRENCIES = ["ARS", "USD"] as const
export type ReportCurrency = (typeof REPORT_CURRENCIES)[number]

export const CASHFLOW_GRANULARITIES = ["mensual", "semanal"] as const
export type CashflowGranularity = (typeof CASHFLOW_GRANULARITIES)[number]

export type ReportQuery = {
  tab: ReportTab
  currency: ReportCurrency
  granularity: CashflowGranularity
  filters: MovementQuery
}

type RawParams = Record<string, string | string[] | undefined>

function one(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? ""
}

export function parseReportQuery(raw: RawParams): ReportQuery {
  const tabRaw = one(raw.tab)
  const monedaRaw = one(raw.moneda)
  const granularidadRaw = one(raw.granularidad)

  const tab: ReportTab = (REPORT_TABS as readonly string[]).includes(tabRaw)
    ? (tabRaw as ReportTab)
    : "flujo"
  // Enlaces viejos con `?moneda=todo` caen en el default ("ARS").
  const currency: ReportCurrency = (REPORT_CURRENCIES as readonly string[]).includes(monedaRaw)
    ? (monedaRaw as ReportCurrency)
    : "ARS"
  const granularity: CashflowGranularity =
    tab === "flujo" &&
    (CASHFLOW_GRANULARITIES as readonly string[]).includes(granularidadRaw)
      ? (granularidadRaw as CashflowGranularity)
      : "mensual"

  const baseFilters = parseMovementQuery(raw, "date")
  const filters: MovementQuery =
    tab === "flujo"
      ? {
          ...FILTER_DEFAULTS,
          from: baseFilters.from,
          to: baseFilters.to,
          sort: "date",
          dir: "desc",
          page: 1,
        }
      : {
          ...baseFilters,
          currency: "all",
          status: "all",
          dateField: "date",
          sort: "date",
          dir: "desc",
          page: 1,
        }

  return { tab, currency, granularity, filters }
}

export function reportExtraParams(query: ReportQuery): Record<string, string | undefined> {
  return {
    tab: query.tab === "ingresos-gastos" ? "ingresos-gastos" : undefined,
    moneda: query.tab === "ingresos-gastos" && query.currency !== "ARS" ? query.currency : undefined,
    granularidad:
      query.tab === "flujo" && query.granularity === "semanal" ? "semanal" : undefined,
  }
}

export function buildReportHref(
  query: ReportQuery,
  patch: {
    tab?: ReportTab
    currency?: ReportCurrency
    granularity?: CashflowGranularity
    filters?: Partial<MovementQuery>
  } = {},
): string {
  const nextTab = patch.tab ?? query.tab
  const nextCurrency = patch.currency ?? query.currency
  const nextGranularity =
    nextTab === "flujo" ? (patch.granularity ?? query.granularity) : "mensual"

  const baseFilters =
    nextTab === "flujo"
      ? {
          ...FILTER_DEFAULTS,
          from: query.filters.from,
          to: query.filters.to,
          sort: "date" as const,
          dir: "desc" as const,
          page: 1,
        }
      : query.filters

  const nextQuery: ReportQuery = {
    tab: nextTab,
    currency: nextCurrency,
    granularity: nextGranularity,
    filters: { ...baseFilters, ...patch.filters },
  }

  return buildMovementHref(
    "/informes",
    nextQuery.filters,
    {},
    "date",
    reportExtraParams(nextQuery),
  )
}

function normalizePair(from: IsoDate, to: IsoDate): { from: IsoDate; to: IsoDate } {
  return from <= to ? { from, to } : { from: to, to: from }
}

export function effectivePnlRange(
  from: string,
  to: string,
  today: IsoDate,
): { from: IsoDate; to: IsoDate; isDefault: boolean } {
  if (from && to) return { ...normalizePair(from, to), isDefault: false }
  if (from) {
    const end = monthRange(monthKey(today)).to
    return { from, to: from > end ? from : end, isDefault: false }
  }
  if (to) {
    const start = `${monthKey(addMonthsClamped(`${monthKey(to)}-01`, -11))}-01`
    return { from: start, to, isDefault: false }
  }
  return { ...presetRange("last_12_months", today), isDefault: true }
}

/**
 * El flujo de caja sólo mira desde hoy hacia adelante: cualquier fecha
 * anterior a hoy se acota a `today`.
 */
export function effectiveCashflowRange(
  from: string,
  to: string,
  granularity: CashflowGranularity,
  today: IsoDate,
): { from: IsoDate; to: IsoDate; isDefault: boolean } {
  if (granularity === "semanal") {
    return { from: today, to: addMonthsClamped(today, 3), isDefault: true }
  }
  const ym = monthKey(today)
  const defaultEnd = monthRange(monthKey(addMonthsClamped(`${ym}-01`, 6))).to
  if (from && to) {
    const pair = normalizePair(from, to)
    const clampedFrom = pair.from < today ? today : pair.from
    const clampedTo = pair.to < clampedFrom ? clampedFrom : pair.to
    return { from: clampedFrom, to: clampedTo, isDefault: false }
  }
  if (from) {
    const clampedFrom = from < today ? today : from
    return { from: clampedFrom, to: clampedFrom > defaultEnd ? clampedFrom : defaultEnd, isDefault: false }
  }
  if (to) {
    const clampedTo = to < today ? today : to
    return { from: today, to: clampedTo, isDefault: false }
  }
  return {
    from: today,
    to: defaultEnd,
    isDefault: true,
  }
}
