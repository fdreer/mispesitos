import {
  addDaysIso,
  addMonthsClamped,
  formatIsoForDisplay,
  monthKey,
  monthRange,
  type IsoDate,
} from "@/lib/dates"
import { convertToArs, type Currency } from "@/lib/money"
import {
  assertCurrency,
  assertExchangeDirection,
  assertInstallmentMovementKind,
} from "@/lib/movement-asserts"
import type { CashflowGranularity, ReportCurrency } from "@/lib/report-query"
import { formatShortMonth, monthsInRange } from "@/lib/reports-pnl"

export type CashflowPaidRow = {
  paidDate: IsoDate
  amountCents: number
  currency: string
  kind: string
  rate: string
}

export type CashflowExchangeRow = {
  date: IsoDate
  amountCents: number
  rate: string
  direction: string | null
}

export type CashflowPendingRow = {
  id: string
  dueDate: IsoDate
  amountCents: number
  currency: string
  rate: string
  kind: string
}

export type CashflowInput = {
  today: IsoDate
  from: IsoDate
  to: IsoDate
  granularity: CashflowGranularity
  currencyMode: ReportCurrency
  settings: {
    initialBalanceArsCents: number
    initialBalanceUsdCents: number
    initialBalanceUsdRate: string
    initialBalanceDate: IsoDate
  }
  paid: CashflowPaidRow[]
  exchanges: CashflowExchangeRow[]
  pending: CashflowPendingRow[]
}

export type CashflowRowKind = "real" | "mixed" | "projected"

export type CashflowRow = {
  key: string
  label: string
  from: IsoDate
  to: IsoDate
  kind: CashflowRowKind
  beforeInitialBalance: boolean
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
}

export type CashflowNegativeAlert = {
  periodKey: string
  periodLabel: string
  shortageCents: number
  includesOverdue: boolean
}

export type CashflowReportView = {
  displayCurrency: Currency
  granularity: CashflowGranularity
  rows: CashflowRow[]
  overdue: CashflowOverdue
  negativeAlert: CashflowNegativeAlert | null
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

function flowAmountCents(
  row: { amountCents: number; currency: string; rate: string },
  currencyMode: ReportCurrency,
): number | null {
  const currency = assertCurrency(row.currency)
  if (currencyMode === "ARS") return currency === "ARS" ? row.amountCents : null
  if (currencyMode === "USD") return currency === "USD" ? row.amountCents : null
  return currency === "ARS" ? row.amountCents : convertToArs(row.amountCents, Number(row.rate))
}

function exchangeParts(
  row: CashflowExchangeRow,
  currencyMode: ReportCurrency,
): { inflowCents: number; outflowCents: number } {
  const direction = assertExchangeDirection(row.direction)
  if (currencyMode === "todo") return { inflowCents: 0, outflowCents: 0 }
  if (currencyMode === "USD") {
    return direction === "buy"
      ? { inflowCents: row.amountCents, outflowCents: 0 }
      : { inflowCents: 0, outflowCents: row.amountCents }
  }
  const arsCents = convertToArs(row.amountCents, Number(row.rate))
  return direction === "sell"
    ? { inflowCents: arsCents, outflowCents: 0 }
    : { inflowCents: 0, outflowCents: arsCents }
}

function initialBalanceCents(
  settings: CashflowInput["settings"],
  currencyMode: ReportCurrency,
): number {
  if (currencyMode === "ARS") return settings.initialBalanceArsCents
  if (currencyMode === "USD") return settings.initialBalanceUsdCents
  return (
    settings.initialBalanceArsCents +
    convertToArs(settings.initialBalanceUsdCents, Number(settings.initialBalanceUsdRate))
  )
}

function realBalanceAtToday(input: CashflowInput): number {
  if (input.today < input.settings.initialBalanceDate) return 0
  let balance = initialBalanceCents(input.settings, input.currencyMode)

  for (const p of input.paid) {
    if (p.paidDate < input.settings.initialBalanceDate || p.paidDate > input.today) continue
    const val = flowAmountCents(p, input.currencyMode)
    if (val === null) continue
    const kind = assertInstallmentMovementKind(p.kind)
    balance += kind === "income" ? val : -val
  }

  for (const e of input.exchanges) {
    if (e.date < input.settings.initialBalanceDate || e.date > input.today) continue
    const { inflowCents, outflowCents } = exchangeParts(e, input.currencyMode)
    balance += inflowCents - outflowCents
  }

  return balance
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
  pending: CashflowPendingRow[],
  today: IsoDate,
  currencyMode: ReportCurrency,
): CashflowOverdue {
  let expenseCents = 0
  let incomeCents = 0
  let expenseCount = 0
  let incomeCount = 0

  for (const p of pending) {
    if (p.dueDate >= today) continue
    const val = flowAmountCents(p, currencyMode)
    if (val === null) continue
    const kind = assertInstallmentMovementKind(p.kind)
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
  }
}

function findNegativeAlert(
  rows: CashflowRow[],
  overdue: CashflowOverdue,
  granularity: CashflowGranularity,
  today: IsoDate,
): CashflowNegativeAlert | null {
  for (const row of rows) {
    if (row.beforeInitialBalance || row.kind === "real") continue
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

function buildMonthlyRows(input: CashflowInput): CashflowRow[] {
  const displayedMonths = monthsInRange(input.from, input.to)
  if (displayedMonths.length === 0) return []

  const initMonth = monthKey(input.settings.initialBalanceDate)
  const currentMonth = monthKey(input.today)
  const firstMonth = displayedMonths[0]
  const lastMonth = displayedMonths[displayedMonths.length - 1]

  const realByMonth = new Map<string, { inflows: number; outflows: number }>()
  const addReal = (ym: string, inflow: number, outflow: number) => {
    const b = realByMonth.get(ym) ?? { inflows: 0, outflows: 0 }
    b.inflows += inflow
    b.outflows += outflow
    realByMonth.set(ym, b)
  }

  for (const p of input.paid) {
    if (p.paidDate < input.settings.initialBalanceDate) continue
    const val = flowAmountCents(p, input.currencyMode)
    if (val === null) continue
    const kind = assertInstallmentMovementKind(p.kind)
    addReal(monthKey(p.paidDate), kind === "income" ? val : 0, kind === "expense" ? val : 0)
  }

  for (const e of input.exchanges) {
    if (e.date < input.settings.initialBalanceDate || e.date > input.today) continue
    const { inflowCents, outflowCents } = exchangeParts(e, input.currencyMode)
    if (inflowCents === 0 && outflowCents === 0) continue
    addReal(monthKey(e.date), inflowCents, outflowCents)
  }

  const pendingByMonth = new Map<string, { inflows: number; outflows: number }>()
  for (const p of input.pending) {
    // Las vencidas se muestran aparte ("Atrasado"), nunca dentro del mes actual.
    if (p.dueDate < input.today) continue
    const val = flowAmountCents(p, input.currencyMode)
    if (val === null) continue
    const kind = assertInstallmentMovementKind(p.kind)
    const ym = monthKey(p.dueDate)
    const b = pendingByMonth.get(ym) ?? { inflows: 0, outflows: 0 }
    if (kind === "income") b.inflows += val
    else b.outflows += val
    pendingByMonth.set(ym, b)
  }

  // Arrancamos la simulación desde el menor entre el saldo inicial y el rango
  // visible para que `saldo inicial` del primer mes visible herede el saldo real
  // (y/o proyectado intermedio) acumulado hasta ese día.
  const simStart = firstMonth < initMonth ? firstMonth : initMonth
  const allMonths = monthsInRange(`${simStart}-01`, monthRange(lastMonth).to, 240)
  const displayedSet = new Set(displayedMonths)
  const initialSeed = initialBalanceCents(input.settings, input.currencyMode)

  const rows: CashflowRow[] = []
  let running = 0

  // Si la ventana de simulación (topada a 240 meses) arrancó después de
  // `initMonth`, acumulamos el saldo inicial + lo real ocurrido entre
  // `initMonth` y el primer mes simulado para no perder `initialSeed`.
  const firstSimMonth = allMonths[0]
  if (firstSimMonth && initMonth < firstSimMonth) {
    running = initialSeed
    for (const [ym, b] of realByMonth) {
      if (ym >= initMonth && ym < firstSimMonth && ym <= currentMonth) {
        running += b.inflows - b.outflows
      }
    }
  }

  for (const m of allMonths) {
    const range = monthRange(m)
    const kind: CashflowRowKind =
      m < currentMonth ? "real" : m === currentMonth ? "mixed" : "projected"

    if (m < initMonth) {
      if (displayedSet.has(m)) {
        rows.push({
          key: m,
          label: formatShortMonth(m),
          from: range.from,
          to: range.to,
          kind,
          beforeInitialBalance: true,
          initialCents: 0,
          inflowsCents: 0,
          outflowsCents: 0,
          netCents: 0,
          closingCents: 0,
        })
      }
      continue
    }

    if (m === initMonth) running = initialSeed
    const rowInitial = running
    const real = realByMonth.get(m) ?? { inflows: 0, outflows: 0 }
    const pend = pendingByMonth.get(m) ?? { inflows: 0, outflows: 0 }

    let inflowsCents = 0
    let outflowsCents = 0
    if (kind === "real") {
      inflowsCents = real.inflows
      outflowsCents = real.outflows
    } else if (kind === "mixed") {
      inflowsCents = real.inflows + pend.inflows
      outflowsCents = real.outflows + pend.outflows
    } else {
      inflowsCents = pend.inflows
      outflowsCents = pend.outflows
    }

    const netCents = inflowsCents - outflowsCents
    const closingCents = rowInitial + netCents
    running = closingCents

    if (displayedSet.has(m)) {
      rows.push({
        key: m,
        label: formatShortMonth(m),
        from: range.from,
        to: range.to,
        kind,
        beforeInitialBalance: false,
        initialCents: rowInitial,
        inflowsCents,
        outflowsCents,
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
      const val = flowAmountCents(p, input.currencyMode)
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
      kind: "projected",
      beforeInitialBalance: false,
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
  const displayCurrency: Currency = input.currencyMode === "USD" ? "USD" : "ARS"
  const currentBalanceCents = realBalanceAtToday(input)
  const overdue = computeOverdue(input.pending, input.today, input.currencyMode)
  const rows =
    input.granularity === "semanal"
      ? buildWeeklyRows(input, currentBalanceCents)
      : buildMonthlyRows(input)

  const negativeAlert = findNegativeAlert(rows, overdue, input.granularity, input.today)
  const projectedEndBalanceCents = rows.at(-1)?.closingCents ?? currentBalanceCents

  return {
    displayCurrency,
    granularity: input.granularity,
    rows,
    overdue,
    negativeAlert,
    currentBalanceCents,
    projectedEndBalanceCents,
  }
}
