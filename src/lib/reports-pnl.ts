import { categoryHues } from "@/lib/category-tree"
import type { TreeCategory } from "@/lib/category-tree"
import { addMonthsClamped, monthKey, monthRange, type IsoDate } from "@/lib/dates"
import { assertCurrency, assertInstallmentMovementKind } from "@/lib/movement-asserts"
import {
  buildMovementHref,
  defaultSortForKind,
  FILTER_DEFAULTS,
  type MovementQuery,
} from "@/lib/movement-query"
import { naturalDir } from "@/lib/movement-list-view"
import { BASE_PATHS } from "@/lib/movement-routes"

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
}

export type PnlCell = {
  month: string
  arsCents: number
  usdCents: number
  arsVariationPct: number | null
  usdVariationPct: number | null
}

export type PnlChildRow = {
  name: string
  categoryIds: string[]
  hue: number | null
  cells: PnlCell[]
  totalArsCents: number
  totalUsdCents: number
}

export type PnlParentRow = {
  name: string
  categoryIds: string[]
  hue: number | null
  cells: PnlCell[]
  totalArsCents: number
  totalUsdCents: number
  children: PnlChildRow[]
}

export type PnlMonthTotal = {
  month: string
  incomeArsCents: number
  incomeUsdCents: number
  incomeArsVarPct: number | null
  incomeUsdVarPct: number | null
  expenseArsCents: number
  expenseUsdCents: number
  expenseArsVarPct: number | null
  expenseUsdVarPct: number | null
  netArsCents: number
  netUsdCents: number
  netArsVarPct: number | null
  netUsdVarPct: number | null
}

export type PnlChartPoint = {
  month: string
  label: string
  incomeCents: number
  expenseCents: number
  netCents: number
}

export type PnlCurrencySummary = {
  incomeCents: number
  expenseCents: number
  netCents: number
  savingsRatePct: number | null
}

export type PnlReportView = {
  effectiveFrom: IsoDate
  effectiveTo: IsoDate
  months: string[]
  summary: {
    ars: PnlCurrencySummary
    usd: PnlCurrencySummary
  }
  chart: {
    ars: PnlChartPoint[]
    usd: PnlChartPoint[]
  }
  incomeRows: PnlParentRow[]
  expenseRows: PnlParentRow[]
  totalsByMonth: PnlMonthTotal[]
  grandTotal: {
    ars: { incomeCents: number; expenseCents: number; netCents: number }
    usd: { incomeCents: number; expenseCents: number; netCents: number }
  }
}

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
})

export function formatShortMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number)
  if (!year || !month) return yearMonth
  return SHORT_MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 15)))
    .replace(/\./g, "")
    .trim()
}

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

type MonthBucket = { arsCents: number; usdCents: number }

type MutableChild = {
  name: string
  categoryIds: Set<string>
  hue: number | null
  byMonth: Map<string, MonthBucket>
  totalArsCents: number
  totalUsdCents: number
}

type MutableParent = {
  name: string
  categoryIds: Set<string>
  hue: number | null
  byMonth: Map<string, MonthBucket>
  totalArsCents: number
  totalUsdCents: number
  children: Map<string, MutableChild>
}

function addBucket(map: Map<string, MonthBucket>, ym: string, arsCents: number, usdCents: number) {
  const b = map.get(ym) ?? { arsCents: 0, usdCents: 0 }
  b.arsCents += arsCents
  b.usdCents += usdCents
  map.set(ym, b)
}

function buildSectionRows(
  rows: { paidDate: IsoDate; categoryId: string | null; arsCents: number; usdCents: number }[],
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
        totalArsCents: 0,
        totalUsdCents: 0,
        children: new Map(),
      }
      groups.set(parentName, group)
    }
    if (parent) group.categoryIds.add(parent.id)
    addBucket(group.byMonth, ym, row.arsCents, row.usdCents)
    if (inMainRange) {
      group.totalArsCents += row.arsCents
      group.totalUsdCents += row.usdCents
    }

    if (cat && parent && cat.id !== parent.id) {
      let child = group.children.get(cat.name)
      if (!child) {
        child = {
          name: cat.name,
          categoryIds: new Set(),
          hue: hues.get(cat.id) ?? null,
          byMonth: new Map(),
          totalArsCents: 0,
          totalUsdCents: 0,
        }
        group.children.set(cat.name, child)
      }
      child.categoryIds.add(cat.id)
      addBucket(child.byMonth, ym, row.arsCents, row.usdCents)
      if (inMainRange) {
        child.totalArsCents += row.arsCents
        child.totalUsdCents += row.usdCents
      }
    }
  }

  const toCells = (byMonth: Map<string, MonthBucket>): PnlCell[] =>
    months.map((m, idx) => {
      const cur = byMonth.get(m) ?? { arsCents: 0, usdCents: 0 }
      const priorKey = idx === 0 ? prevMonth : months[idx - 1]
      const prev = byMonth.get(priorKey) ?? { arsCents: 0, usdCents: 0 }
      return {
        month: m,
        arsCents: cur.arsCents,
        usdCents: cur.usdCents,
        arsVariationPct: computeVariationPct(cur.arsCents, prev.arsCents),
        usdVariationPct: computeVariationPct(cur.usdCents, prev.usdCents),
      }
    })

  const compareRows = (
    a: { totalArsCents: number; totalUsdCents: number; name: string },
    b: { totalArsCents: number; totalUsdCents: number; name: string },
  ) =>
    b.totalArsCents - a.totalArsCents ||
    b.totalUsdCents - a.totalUsdCents ||
    a.name.localeCompare(b.name, "es")

  return [...groups.values()]
    .filter((g) => g.totalArsCents > 0 || g.totalUsdCents > 0)
    .map((g) => ({
      name: g.name,
      categoryIds: [...g.categoryIds],
      hue: g.hue,
      cells: toCells(g.byMonth),
      totalArsCents: g.totalArsCents,
      totalUsdCents: g.totalUsdCents,
      children: [...g.children.values()]
        .filter((c) => c.totalArsCents > 0 || c.totalUsdCents > 0)
        .map((c) => ({
          name: c.name,
          categoryIds: [...c.categoryIds],
          hue: c.hue,
          cells: toCells(c.byMonth),
          totalArsCents: c.totalArsCents,
          totalUsdCents: c.totalUsdCents,
        }))
        .sort(compareRows),
    }))
    .sort(compareRows)
}

export function buildPnlReport(input: {
  from: IsoDate
  to: IsoDate
  categories: ReportCategory[]
  paidInstallments: ReportPaidInstallment[]
}): PnlReportView {
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

  const incomeItems: {
    paidDate: IsoDate
    categoryId: string | null
    arsCents: number
    usdCents: number
  }[] = []
  const expenseItems: {
    paidDate: IsoDate
    categoryId: string | null
    arsCents: number
    usdCents: number
  }[] = []

  const incomeByMonth = new Map<string, MonthBucket>()
  const expenseByMonth = new Map<string, MonthBucket>()
  let totalIncomeArs = 0
  let totalIncomeUsd = 0
  let totalExpenseArs = 0
  let totalExpenseUsd = 0

  for (const row of input.paidInstallments) {
    const currency = assertCurrency(row.currency)
    const kind = assertInstallmentMovementKind(row.kind)
    const ym = monthKey(row.paidDate)
    const inMainRange = row.paidDate >= effectiveFrom && row.paidDate <= effectiveTo
    const isPrevMonth = row.paidDate < effectiveFrom && ym === prevMonth
    if (!inMainRange && !isPrevMonth) continue

    const arsCents = currency === "ARS" ? row.amountCents : 0
    const usdCents = currency === "USD" ? row.amountCents : 0

    if (kind === "income") {
      incomeItems.push({ paidDate: row.paidDate, categoryId: row.categoryId, arsCents, usdCents })
      addBucket(incomeByMonth, ym, arsCents, usdCents)
      if (inMainRange) {
        totalIncomeArs += arsCents
        totalIncomeUsd += usdCents
      }
    } else {
      expenseItems.push({ paidDate: row.paidDate, categoryId: row.categoryId, arsCents, usdCents })
      addBucket(expenseByMonth, ym, arsCents, usdCents)
      if (inMainRange) {
        totalExpenseArs += arsCents
        totalExpenseUsd += usdCents
      }
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
    const inc = incomeByMonth.get(m) ?? { arsCents: 0, usdCents: 0 }
    const prevInc = incomeByMonth.get(priorKey) ?? { arsCents: 0, usdCents: 0 }
    const exp = expenseByMonth.get(m) ?? { arsCents: 0, usdCents: 0 }
    const prevExp = expenseByMonth.get(priorKey) ?? { arsCents: 0, usdCents: 0 }
    const netArs = inc.arsCents - exp.arsCents
    const netUsd = inc.usdCents - exp.usdCents
    const prevNetArs = prevInc.arsCents - prevExp.arsCents
    const prevNetUsd = prevInc.usdCents - prevExp.usdCents

    return {
      month: m,
      incomeArsCents: inc.arsCents,
      incomeUsdCents: inc.usdCents,
      incomeArsVarPct: computeVariationPct(inc.arsCents, prevInc.arsCents),
      incomeUsdVarPct: computeVariationPct(inc.usdCents, prevInc.usdCents),
      expenseArsCents: exp.arsCents,
      expenseUsdCents: exp.usdCents,
      expenseArsVarPct: computeVariationPct(exp.arsCents, prevExp.arsCents),
      expenseUsdVarPct: computeVariationPct(exp.usdCents, prevExp.usdCents),
      netArsCents: netArs,
      netUsdCents: netUsd,
      netArsVarPct: computeVariationPct(netArs, prevNetArs, true),
      netUsdVarPct: computeVariationPct(netUsd, prevNetUsd, true),
    }
  })

  const netArs = totalIncomeArs - totalExpenseArs
  const netUsd = totalIncomeUsd - totalExpenseUsd

  return {
    effectiveFrom,
    effectiveTo,
    months,
    summary: {
      ars: {
        incomeCents: totalIncomeArs,
        expenseCents: totalExpenseArs,
        netCents: netArs,
        savingsRatePct: totalIncomeArs > 0 ? (netArs / totalIncomeArs) * 100 : null,
      },
      usd: {
        incomeCents: totalIncomeUsd,
        expenseCents: totalExpenseUsd,
        netCents: netUsd,
        savingsRatePct: totalIncomeUsd > 0 ? (netUsd / totalIncomeUsd) * 100 : null,
      },
    },
    chart: {
      ars: totalsByMonth.map((t) => ({
        month: t.month,
        label: formatShortMonth(t.month),
        incomeCents: t.incomeArsCents,
        expenseCents: t.expenseArsCents,
        netCents: t.netArsCents,
      })),
      usd: totalsByMonth.map((t) => ({
        month: t.month,
        label: formatShortMonth(t.month),
        incomeCents: t.incomeUsdCents,
        expenseCents: t.expenseUsdCents,
        netCents: t.netUsdCents,
      })),
    },
    incomeRows,
    expenseRows,
    totalsByMonth,
    grandTotal: {
      ars: { incomeCents: totalIncomeArs, expenseCents: totalExpenseArs, netCents: netArs },
      usd: { incomeCents: totalIncomeUsd, expenseCents: totalExpenseUsd, netCents: netUsd },
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
  currency?: "ARS" | "USD" | "all"
  filters: Pick<MovementQuery, "search" | "categoryIds" | "cardId" | "minCents" | "maxCents">
}): string {
  const { kind, categoryIds, month, effectiveFrom, effectiveTo, currency = "all", filters } = params
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
    currency,
    status: "all",
    from,
    to,
    dateField: "paid",
    minCents: filters.minCents,
    maxCents: filters.maxCents,
    sort: defaultSort,
    dir: naturalDir(defaultSort),
    page: 1,
  }

  return buildMovementHref(BASE_PATHS[kind], base, {}, defaultSort)
}
