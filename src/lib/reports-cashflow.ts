import type { Balances } from "@/lib/balance"
import {
  addDaysIso,
  addMonthsClamped,
  formatIsoForDisplay,
  monthKey,
  monthRange,
  type IsoDate,
} from "@/lib/dates"
import { convertToArs } from "@/lib/money"
import { assertCurrency, assertInstallmentMovementKind } from "@/lib/movement-asserts"
import type { OfficialRateSnapshot } from "@/lib/rate"
import type { CashflowGranularity } from "@/lib/report-query"
import { formatShortMonth, monthsInRange } from "@/lib/reports-pnl"

export type CashflowPendingRow = {
  id: string
  dueDate: IsoDate
  amountCents: number
  currency: string
  kind: string
  statementId?: string | null
  statementPeriod?: string | null
  cardId?: string | null
  cardName?: string | null
}

export type CashflowInput = {
  today: IsoDate
  from: IsoDate
  to: IsoDate
  granularity: CashflowGranularity
  balances: Balances
  pending: CashflowPendingRow[]
  officialRate: OfficialRateSnapshot | null
}

export type CashflowRow = {
  key: string
  label: string
  from: IsoDate
  to: IsoDate
  initialCents: number
  inflowsCents: number
  outflowsCents: number
  netCents: number
  closingCents: number
}

export type CashflowOverdue = {
  expenseCents: number
  incomeCents: number
  netCents: number
  expenseCount: number
  incomeCount: number
  unconvertedUsdExpenseCents: number
  unconvertedUsdIncomeCents: number
}

export type CashflowNegativeAlert = {
  periodKey: string
  periodLabel: string
  shortageCents: number
  includesOverdue: boolean
}

export type CashflowCardDue = {
  id: string
  cardId: string
  cardName: string
  period: string
  dueDate: IsoDate
  arsCents: number
  usdCents: number
  usdInArsCents: number | null
}

export type CashflowReportView = {
  granularity: CashflowGranularity
  balances: Balances
  usdBalanceInArsCents: number | null
  officialRate: OfficialRateSnapshot | null
  missingRateForUsd: boolean
  rows: CashflowRow[]
  overdue: CashflowOverdue
  negativeAlert: CashflowNegativeAlert | null
  upcomingCards: CashflowCardDue[]
  currentBalanceCents: number
  projectedEndBalanceCents: number
}

const MONTH_NAMES_LOWER_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const

/**
 * Convierte un pendiente a pesos según las reglas del flujo:
 * - ARS: por su valor
 * - Ingreso USD: × oficial comprador (`compra`)
 * - Egreso USD (incluida la parte en USD de tarjetas): × oficial vendedor (`venta`)
 * Sin cotización oficial, los USD devuelven `null` y no se suman.
 */
function pendingToArsCents(
  row: { amountCents: number; currency: string; kind: string },
  officialRate: OfficialRateSnapshot | null,
): number | null {
  const currency = assertCurrency(row.currency)
  if (currency === "ARS") return row.amountCents
  if (officialRate === null) return null
  const kind = assertInstallmentMovementKind(row.kind)
  const rate = kind === "income" ? officialRate.compra : officialRate.venta
  return convertToArs(row.amountCents, rate)
}

function formatAlertPeriodLabel(
  row: CashflowRow,
  granularity: CashflowGranularity,
  today: IsoDate,
): string {
  if (granularity === "semanal") {
    return `la semana del ${formatIsoForDisplay(row.from).slice(0, 5)}`
  }
  const [y, m] = row.key.split("-").map(Number)
  const name = MONTH_NAMES_LOWER_ES[(m ?? 1) - 1] ?? row.label
  return String(y) === today.slice(0, 4) ? name : `${name} ${y}`
}

function computeOverdue(
  pending: readonly CashflowPendingRow[],
  today: IsoDate,
  officialRate: OfficialRateSnapshot | null,
): CashflowOverdue {
  let expenseCents = 0
  let incomeCents = 0
  let expenseCount = 0
  let incomeCount = 0
  let unconvertedUsdExpenseCents = 0
  let unconvertedUsdIncomeCents = 0

  for (const p of pending) {
    if (p.dueDate >= today) continue
    const kind = assertInstallmentMovementKind(p.kind)
    const val = pendingToArsCents(p, officialRate)
    if (val === null) {
      if (kind === "expense") {
        unconvertedUsdExpenseCents += p.amountCents
        expenseCount++
      } else {
        unconvertedUsdIncomeCents += p.amountCents
        incomeCount++
      }
      continue
    }
    if (kind === "expense") {
      expenseCents += val
      expenseCount++
    } else {
      incomeCents += val
      incomeCount++
    }
  }

  return {
    expenseCents,
    incomeCents,
    netCents: incomeCents - expenseCents,
    expenseCount,
    incomeCount,
    unconvertedUsdExpenseCents,
    unconvertedUsdIncomeCents,
  }
}

function computeUpcomingCards(
  pending: readonly CashflowPendingRow[],
  today: IsoDate,
  officialRate: OfficialRateSnapshot | null,
): CashflowCardDue[] {
  const byStatement = new Map<string, CashflowCardDue>()
  for (const p of pending) {
    if (p.dueDate < today || !p.statementId || !p.cardId) continue
    let entry = byStatement.get(p.statementId)
    if (!entry) {
      entry = {
        id: p.statementId,
        cardId: p.cardId,
        cardName: p.cardName ?? "Tarjeta",
        period: p.statementPeriod ?? monthKey(p.dueDate),
        dueDate: p.dueDate,
        arsCents: 0,
        usdCents: 0,
        usdInArsCents: null,
      }
      byStatement.set(p.statementId, entry)
    }
    if (assertCurrency(p.currency) === "USD") entry.usdCents += p.amountCents
    else entry.arsCents += p.amountCents
  }

  return [...byStatement.values()]
    .map((c) => ({
      ...c,
      usdInArsCents:
        c.usdCents > 0 && officialRate !== null
          ? convertToArs(c.usdCents, officialRate.venta)
          : null,
    }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
}

function findNegativeAlert(
  rows: readonly CashflowRow[],
  overdue: CashflowOverdue,
  granularity: CashflowGranularity,
  today: IsoDate,
): CashflowNegativeAlert | null {
  for (const row of rows) {
    const withOverdue = row.closingCents + overdue.netCents
    if (withOverdue < 0) {
      return {
        periodKey: row.key,
        periodLabel: formatAlertPeriodLabel(row, granularity, today),
        shortageCents: -withOverdue,
        includesOverdue: row.closingCents >= 0 && overdue.netCents < 0,
      }
    }
  }
  return null
}

function buildMonthlyRows(input: CashflowInput, currentBalanceCents: number): CashflowRow[] {
  const currentMonth = monthKey(input.today)
  const effectiveFrom = input.from < input.today ? input.today : input.from
  const effectiveTo = input.to < effectiveFrom ? effectiveFrom : input.to
  const displayedMonths = monthsInRange(effectiveFrom, effectiveTo)
  if (displayedMonths.length === 0) return []

  const lastMonth = displayedMonths[displayedMonths.length - 1]
  const allMonths = monthsInRange(`${currentMonth}-01`, monthRange(lastMonth).to, 240)
  const displayedSet = new Set(displayedMonths)

  const pendingByMonth = new Map<string, { inflows: number; outflows: number }>()
  for (const p of input.pending) {
    // Sólo desde hoy hacia adelante; lo vencido va aparte en "Atrasado".
    if (p.dueDate < input.today) continue
    const val = pendingToArsCents(p, input.officialRate)
    if (val === null) continue
    const kind = assertInstallmentMovementKind(p.kind)
    const ym = monthKey(p.dueDate)
    const b = pendingByMonth.get(ym) ?? { inflows: 0, outflows: 0 }
    if (kind === "income") b.inflows += val
    else b.outflows += val
    pendingByMonth.set(ym, b)
  }

  const rows: CashflowRow[] = []
  let running = currentBalanceCents

  for (const m of allMonths) {
    const range = monthRange(m)
    const pend = pendingByMonth.get(m) ?? { inflows: 0, outflows: 0 }
    const rowInitial = running
    const netCents = pend.inflows - pend.outflows
    const closingCents = rowInitial + netCents
    running = closingCents

    if (displayedSet.has(m)) {
      rows.push({
        key: m,
        label: formatShortMonth(m),
        from: m === currentMonth ? input.today : range.from,
        to: range.to,
        initialCents: rowInitial,
        inflowsCents: pend.inflows,
        outflowsCents: pend.outflows,
        netCents,
        closingCents,
      })
    }
  }

  return rows
}

function buildWeeklyRows(input: CashflowInput, currentBalanceCents: number): CashflowRow[] {
  const end = addMonthsClamped(input.today, 3)
  const futurePending = input.pending.filter((p) => p.dueDate >= input.today && p.dueDate <= end)

  const rows: CashflowRow[] = []
  let running = currentBalanceCents
  let cursor = input.today

  while (cursor <= end) {
    const candidateEnd = addDaysIso(cursor, 6)
    const weekEnd = candidateEnd > end ? end : candidateEnd

    let inflowsCents = 0
    let outflowsCents = 0
    for (const p of futurePending) {
      if (p.dueDate < cursor || p.dueDate > weekEnd) continue
      const val = pendingToArsCents(p, input.officialRate)
      if (val === null) continue
      const kind = assertInstallmentMovementKind(p.kind)
      if (kind === "income") inflowsCents += val
      else outflowsCents += val
    }

    const netCents = inflowsCents - outflowsCents
    const closingCents = running + netCents
    rows.push({
      key: cursor,
      label: `${formatIsoForDisplay(cursor).slice(0, 5)} – ${formatIsoForDisplay(weekEnd).slice(0, 5)}`,
      from: cursor,
      to: weekEnd,
      initialCents: running,
      inflowsCents,
      outflowsCents,
      netCents,
      closingCents,
    })

    running = closingCents
    cursor = addDaysIso(weekEnd, 1)
  }

  return rows
}

export function buildCashflowReport(input: CashflowInput): CashflowReportView {
  const usdBalanceInArsCents =
    input.officialRate !== null
      ? convertToArs(input.balances.usdCents, input.officialRate.compra)
      : null
  const currentBalanceCents = input.balances.arsCents + (usdBalanceInArsCents ?? 0)
  const hasAnyUsd =
    input.balances.usdCents !== 0 || input.pending.some((p) => assertCurrency(p.currency) === "USD")
  const missingRateForUsd = input.officialRate === null && hasAnyUsd

  const overdue = computeOverdue(input.pending, input.today, input.officialRate)
  const upcomingCards = computeUpcomingCards(input.pending, input.today, input.officialRate)
  const rows =
    input.granularity === "semanal"
      ? buildWeeklyRows(input, currentBalanceCents)
      : buildMonthlyRows(input, currentBalanceCents)

  const negativeAlert = findNegativeAlert(rows, overdue, input.granularity, input.today)
  const projectedEndBalanceCents = rows.at(-1)?.closingCents ?? currentBalanceCents

  return {
    granularity: input.granularity,
    balances: input.balances,
    usdBalanceInArsCents,
    officialRate: input.officialRate,
    missingRateForUsd,
    rows,
    overdue,
    negativeAlert,
    upcomingCards,
    currentBalanceCents,
    projectedEndBalanceCents,
  }
}
