import { categoryHues } from "@/lib/category-tree"
import type { TreeCategory } from "@/lib/category-tree"
import { addMonthsClamped, monthKey, monthRange, type IsoDate } from "@/lib/dates"
import { convertToArs, type Currency } from "@/lib/money"
import { assertCurrency, assertInstallmentMovementKind } from "@/lib/movement-asserts"
import {
  buildMovementHref,
  defaultSortForKind,
  FILTER_DEFAULTS,
  type MovementQuery,
} from "@/lib/movement-query"
import { BASE_PATHS } from "@/lib/movement-routes"
import type { ReportCurrency } from "@/lib/report-query"

/**
 * Informe "Ingresos vs Gastos" (§3.1 y §3.3 del plan v2), puro sin base ni React.
 *
 * Trabaja bajo el criterio de lo percibido (§0): cada cuota pagada cuenta en su
 * `paidDate`, ya pasada por `perceivedPayment` (los dólares de un resumen
 * pagado con pesos llegan convertidos a ARS al TC del pago).
 */

export const MAX_REPORT_MONTHS = 60

export type ReportCategory = TreeCategory & {
  kind: string
}

export type ReportPaidInstallment = {
  paidDate: IsoDate
  amountCents: number
  currency: string
  kind: string
  categoryId: string | null
  rate: string
}

export type PnlCell = {
  month: string
  amountCents: number
  variationPct: number | null
}

export type PnlChildRow = {
  name: string
  categoryIds: string[]
  hue: number | null
  cells: PnlCell[]
  totalCents: number
}

export type PnlParentRow = {
  name: string
  categoryIds: string[]
  hue: number | null
  cells: PnlCell[]
  totalCents: number
  children: PnlChildRow[]
}

export type PnlMonthTotal = {
  month: string
  incomeCents: number
  incomeVarPct: number | null
  expenseCents: number
  expenseVarPct: number | null
  netCents: number
  netVarPct: number | null
}

export type PnlReportView = {
  displayCurrency: Currency
  effectiveFrom: IsoDate
  effectiveTo: IsoDate
  months: string[]
  summary: {
    incomeCents: number
    expenseCents: number
    netCents: number
    savingsRatePct: number | null
  }
  chart: {
    month: string
    label: string
    incomeCents: number
    expenseCents: number
    netCents: number
  }[]
  incomeRows: PnlParentRow[]
  expenseRows: PnlParentRow[]
  totalsByMonth: PnlMonthTotal[]
  grandTotal: {
    incomeCents: number
    expenseCents: number
    netCents: number
  }
}

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
})

/** `"2026-11"` -> `"nov 26"`. */
export function formatShortMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number)
  if (!year || !month) return yearMonth
  return SHORT_MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 15)))
    .replace(/\./g, "")
    .trim()
}

/**
 * Lista ordenada de meses `YYYY-MM` entre `from` y `to` (inclusive).
 * Topada a `maxMonths` desde `to` hacia atrás para que una URL editada a mano
 * con un rango de siglos no genere miles de columnas.
 */
export function monthsInRange(
  from: IsoDate,
  to: IsoDate,
  maxMonths = MAX_REPORT_MONTHS,
): string[] {
  if (from > to || maxMonths <= 0) return []
  const [startY, startM] = monthKey(from).split("-").map(Number)
  const [endY, endM] = monthKey(to).split("-").map(Number)
  if (!startY || !startM || !endY || !endM) return []

  const startIdx = startY * 12 + (startM - 1)
  const endIdx = endY * 12 + (endM - 1)
  const total = endIdx - startIdx + 1
  if (total <= 0) return []

  const count = Math.min(total, maxMonths)
  const firstIdx = endIdx - count + 1
  const months: string[] = []
  for (let i = 0; i < count; i++) {
    const idx = firstIdx + i
    const year = Math.floor(idx / 12)
    const month = (idx % 12) + 1
    months.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`)
  }
  return months
}

/**
 * Variación porcentual contra el mes anterior.
 * Devuelve `null` si el mes previo fue 0 (no hay base para dividir).
 */
export function computeVariationPct(
  current: number,
  previous: number,
  useAbsDenominator = false,
): number | null {
  if (previous === 0) return null
  if (!useAbsDenominator && previous < 0) return null
  const denom = useAbsDenominator ? Math.abs(previous) : previous
  return ((current - previous) / denom) * 100
}

/** Valor de una cuota pagada según la moneda del informe, o `null` si no aplica. */
export function reportAmountCents(
  row: { amountCents: number; currency: string; rate: string },
  currencyMode: ReportCurrency,
): number | null {
  const currency = assertCurrency(row.currency)
  if (currencyMode === "ARS") return currency === "ARS" ? row.amountCents : null
  if (currencyMode === "USD") return currency === "USD" ? row.amountCents : null
  return currency === "ARS" ? row.amountCents : convertToArs(row.amountCents, Number(row.rate))
}

type MutableChild = {
  name: string
  categoryIds: Set<string>
  hue: number | null
  byMonth: Map<string, number>
  totalCents: number
}

type MutableParent = {
  name: string
  categoryIds: Set<string>
  hue: number | null
  byMonth: Map<string, number>
  totalCents: number
  children: Map<string, MutableChild>
}

function buildSectionRows(
  rows: { paidDate: IsoDate; categoryId: string | null; valueCents: number }[],
  categories: ReportCategory[],
  months: string[],
  prevMonth: string,
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
): PnlParentRow[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const hues = categoryHues(categories)
  const groups = new Map<string, MutableParent>()

  for (const row of rows) {
    const isPrevMonth =
      row.paidDate < effectiveFrom && monthKey(row.paidDate) === prevMonth
    const inMainRange = row.paidDate >= effectiveFrom && row.paidDate <= effectiveTo
    if (!isPrevMonth && !inMainRange) continue

    const ym = monthKey(row.paidDate)
    const cat = row.categoryId ? byId.get(row.categoryId) : undefined
    const parent =
      cat && cat.parentId !== null ? (byId.get(cat.parentId) ?? cat) : cat

    const parentName = parent?.name ?? "Sin categoría"
    let group = groups.get(parentName)
    if (!group) {
      group = {
        name: parentName,
        categoryIds: new Set(),
        hue: parent ? (hues.get(parent.id) ?? null) : null,
        byMonth: new Map(),
        totalCents: 0,
        children: new Map(),
      }
      groups.set(parentName, group)
    }
    if (parent) group.categoryIds.add(parent.id)
    group.byMonth.set(ym, (group.byMonth.get(ym) ?? 0) + row.valueCents)
    if (inMainRange) group.totalCents += row.valueCents

    if (cat && parent && cat.id !== parent.id) {
      let child = group.children.get(cat.name)
      if (!child) {
        child = {
          name: cat.name,
          categoryIds: new Set(),
          hue: hues.get(cat.id) ?? null,
          byMonth: new Map(),
          totalCents: 0,
        }
        group.children.set(cat.name, child)
      }
      child.categoryIds.add(cat.id)
      child.byMonth.set(ym, (child.byMonth.get(ym) ?? 0) + row.valueCents)
      if (inMainRange) child.totalCents += row.valueCents
    }
  }

  const toCells = (byMonth: Map<string, number>): PnlCell[] =>
    months.map((m, idx) => {
      const amountCents = byMonth.get(m) ?? 0
      const priorKey = idx === 0 ? prevMonth : months[idx - 1]
      const prevCents = byMonth.get(priorKey) ?? 0
      return {
        month: m,
        amountCents,
        variationPct: computeVariationPct(amountCents, prevCents),
      }
    })

  return [...groups.values()]
    .filter((g) => g.totalCents > 0)
    .map((g) => ({
      name: g.name,
      categoryIds: [...g.categoryIds],
      hue: g.hue,
      cells: toCells(g.byMonth),
      totalCents: g.totalCents,
      children: [...g.children.values()]
        .filter((c) => c.totalCents > 0)
        .map((c) => ({
          name: c.name,
          categoryIds: [...c.categoryIds],
          hue: c.hue,
          cells: toCells(c.byMonth),
          totalCents: c.totalCents,
        }))
        .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, "es")),
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, "es"))
}

export function buildPnlReport(input: {
  from: IsoDate
  to: IsoDate
  currencyMode: ReportCurrency
  categories: ReportCategory[]
  paidInstallments: ReportPaidInstallment[]
}): PnlReportView {
  const displayCurrency: Currency = input.currencyMode === "USD" ? "USD" : "ARS"
  const months = monthsInRange(input.from, input.to)
  const effectiveFrom =
    months.length > 0 && monthRange(months[0]).from > input.from
      ? monthRange(months[0]).from
      : input.from
  const effectiveTo = input.to
  const prevMonth =
    months.length > 0
      ? monthKey(addMonthsClamped(`${months[0]}-01`, -1))
      : monthKey(addMonthsClamped(`${monthKey(effectiveFrom)}-01`, -1))

  const incomeItems: { paidDate: IsoDate; categoryId: string | null; valueCents: number }[] = []
  const expenseItems: { paidDate: IsoDate; categoryId: string | null; valueCents: number }[] = []

  const incomeByMonth = new Map<string, number>()
  const expenseByMonth = new Map<string, number>()
  let totalIncomeCents = 0
  let totalExpenseCents = 0

  for (const row of input.paidInstallments) {
    const valueCents = reportAmountCents(row, input.currencyMode)
    if (valueCents === null) continue
    const kind = assertInstallmentMovementKind(row.kind)
    const ym = monthKey(row.paidDate)
    const inMainRange = row.paidDate >= effectiveFrom && row.paidDate <= effectiveTo
    const isPrevMonth = row.paidDate < effectiveFrom && ym === prevMonth
    if (!inMainRange && !isPrevMonth) continue

    if (kind === "income") {
      incomeItems.push({ paidDate: row.paidDate, categoryId: row.categoryId, valueCents })
      incomeByMonth.set(ym, (incomeByMonth.get(ym) ?? 0) + valueCents)
      if (inMainRange) totalIncomeCents += valueCents
    } else {
      expenseItems.push({ paidDate: row.paidDate, categoryId: row.categoryId, valueCents })
      expenseByMonth.set(ym, (expenseByMonth.get(ym) ?? 0) + valueCents)
      if (inMainRange) totalExpenseCents += valueCents
    }
  }

  const incomeCategories = input.categories.filter((c) => c.kind === "income")
  const expenseCategories = input.categories.filter((c) => c.kind === "expense")

  const incomeRows = buildSectionRows(
    incomeItems,
    incomeCategories,
    months,
    prevMonth,
    effectiveFrom,
    effectiveTo,
  )
  const expenseRows = buildSectionRows(
    expenseItems,
    expenseCategories,
    months,
    prevMonth,
    effectiveFrom,
    effectiveTo,
  )

  const totalsByMonth: PnlMonthTotal[] = months.map((m, idx) => {
    const priorKey = idx === 0 ? prevMonth : months[idx - 1]
    const inc = incomeByMonth.get(m) ?? 0
    const prevInc = incomeByMonth.get(priorKey) ?? 0
    const exp = expenseByMonth.get(m) ?? 0
    const prevExp = expenseByMonth.get(priorKey) ?? 0
    const net = inc - exp
    const prevNet = prevInc - prevExp
    return {
      month: m,
      incomeCents: inc,
      incomeVarPct: computeVariationPct(inc, prevInc),
      expenseCents: exp,
      expenseVarPct: computeVariationPct(exp, prevExp),
      netCents: net,
      netVarPct: computeVariationPct(net, prevNet, true),
    }
  })

  const netCents = totalIncomeCents - totalExpenseCents
  const savingsRatePct =
    totalIncomeCents > 0 ? (netCents / totalIncomeCents) * 100 : null

  return {
    displayCurrency,
    effectiveFrom,
    effectiveTo,
    months,
    summary: {
      incomeCents: totalIncomeCents,
      expenseCents: totalExpenseCents,
      netCents,
      savingsRatePct,
    },
    chart: totalsByMonth.map((t) => ({
      month: t.month,
      label: formatShortMonth(t.month),
      incomeCents: t.incomeCents,
      expenseCents: t.expenseCents,
      netCents: t.netCents,
    })),
    incomeRows,
    expenseRows,
    totalsByMonth,
    grandTotal: {
      incomeCents: totalIncomeCents,
      expenseCents: totalExpenseCents,
      netCents,
    },
  }
}

/**
 * Construye el enlace al listado de movimientos (/ingresos o /egresos) con
 * categoría + mes (acotado al rango del informe) + `por=pago`, conservando
 * tarjeta/buscador/importes que estuvieran activos en la barra de filtros.
 */
export function buildPnlCellHref(params: {
  kind: "income" | "expense"
  categoryIds: string[]
  month: string | null
  effectiveFrom: IsoDate
  effectiveTo: IsoDate
  currencyMode: ReportCurrency
  filters: Pick<MovementQuery, "search" | "categoryIds" | "cardId" | "minCents" | "maxCents">
}): string {
  const { kind, categoryIds, month, effectiveFrom, effectiveTo, currencyMode, filters } = params
  const mRange = month ? monthRange(month) : null
  const from = mRange
    ? mRange.from < effectiveFrom
      ? effectiveFrom
      : mRange.from
    : effectiveFrom
  const to = mRange ? (mRange.to > effectiveTo ? effectiveTo : mRange.to) : effectiveTo
  const defaultSort = defaultSortForKind(kind)

  const base: MovementQuery = {
    ...FILTER_DEFAULTS,
    search: filters.search,
    categoryIds,
    cardId: kind === "expense" ? filters.cardId : "all",
    currency: currencyMode === "todo" ? "all" : currencyMode,
    status: "all",
    from,
    to,
    dateField: "paid",
    minCents: filters.minCents,
    maxCents: filters.maxCents,
    sort: defaultSort,
    page: 1,
  }

  return buildMovementHref(BASE_PATHS[kind], base, {}, defaultSort)
}
