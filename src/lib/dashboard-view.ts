import { computeBalances } from "@/lib/balance"
import { monthlyTotals } from "@/lib/dashboard"
import { spendByParent, type SpendGroup, type TreeCategory } from "@/lib/category-tree"
import { addMonthsClamped, isOverdue, monthKey, monthRange, type IsoDate } from "@/lib/dates"
import { convertToArs } from "@/lib/money"
import {
  assertCurrency,
  assertExchangeDirection,
  assertInstallmentMovementKind,
} from "@/lib/movement-asserts"
import type { MovementStatus } from "@/lib/movement-status"
import type { OfficialRateSnapshot } from "@/lib/rate"
import { buildCashflowReport } from "@/lib/reports-cashflow"

type PaidRow = {
  paidDate: IsoDate
  amountCents: number
  currency: string
  kind: string
  categoryId: string | null
}

type ExchangeRow = {
  date: IsoDate
  amountCents: number
  rate: string | null
  direction: string | null
}

type PendingRow = {
  id: string
  number: number
  dueDate: IsoDate
  amountCents: number
  movementId: string
  description: string
  currency: string
  kind: string
  statementId?: string | null
  statementPeriod?: string | null
  cardId?: string | null
  cardName?: string | null
}

export type DashboardInput = {
  today: IsoDate
  settings: {
    initialBalanceArsCents: number
    initialBalanceUsdCents: number
    initialBalanceDate: IsoDate
  }
  officialRate: OfficialRateSnapshot | null
  paid: PaidRow[]
  exchanges: ExchangeRow[]
  pending: PendingRow[]
  expenseCategories: TreeCategory[]
  horizonMonths: number
  historyMonths: number
}

export type UpcomingItem = {
  id: string
  number: number
  dueDate: IsoDate
  amountCents: number
  description: string
  currency: "ARS" | "USD"
  kind: "income" | "expense"
  status: MovementStatus
}

export type UpcomingStatement = {
  type: "statement"
  id: string
  cardId: string
  cardName: string
  period: string
  dueDate: IsoDate
  arsCents: number
  usdCents: number
  kind: "expense"
  status: MovementStatus
}

export type UpcomingPayment = UpcomingItem | UpcomingStatement

export function isUpcomingStatement(item: UpcomingPayment): item is UpcomingStatement {
  return "type" in item && item.type === "statement"
}

export type MonthlyBarPoint = {
  month: string
  incomeCents: number
  expenseCents: number
}

export type DashboardView = {
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  monthIncomeArsCents: number
  monthIncomeUsdCents: number
  monthExpenseArsCents: number
  monthExpenseUsdCents: number
  paymentsThisMonth: { arsCents: number; usdCents: number; count: number; overdueCount: number }
  paymentsNextMonth: { arsCents: number; usdCents: number; count: number }
  projection: { month: string; arsCents: number }[] | null
  upcomingPayments: UpcomingPayment[]
  upcomingReceivables: UpcomingItem[]
  pie: { ars: SpendGroup[]; usd: SpendGroup[] }
  bars: { ars: MonthlyBarPoint[]; usd: MonthlyBarPoint[] }
  officialRate: OfficialRateSnapshot | null
}

const MAX_UPCOMING = 20

export function buildDashboardView(input: DashboardInput): DashboardView {
  const { today, settings, officialRate } = input

  const balances = computeBalances(
    {
      initialArsCents: settings.initialBalanceArsCents,
      initialUsdCents: settings.initialBalanceUsdCents,
      initialDate: settings.initialBalanceDate,
    },
    input.paid.map((p) => ({
      paidDate: p.paidDate,
      currency: assertCurrency(p.currency),
      kind: assertInstallmentMovementKind(p.kind),
      amountCents: p.amountCents,
    })),
    input.exchanges.map((e) => ({
      date: e.date,
      direction: assertExchangeDirection(e.direction),
      usdCents: e.amountCents,
      rate: Number(e.rate),
    })),
  )

  const consolidatedArsCents =
    officialRate === null
      ? null
      : balances.arsCents + convertToArs(balances.usdCents, officialRate.compra)

  const thisMonth = monthKey(today)
  const nextMonth = monthKey(addMonthsClamped(today, 1))
  const firstDayNextMonth = `${nextMonth}-01`
  const firstDayAfterNextMonth = `${monthKey(addMonthsClamped(today, 2))}-01`

  const paidSinceStart = input.paid.filter((p) => p.paidDate >= settings.initialBalanceDate)
  const monthPaid = paidSinceStart.filter((p) => monthKey(p.paidDate) === thisMonth)

  const conceptos = (rows: PendingRow[]) =>
    new Set(rows.map((p) => p.statementId ?? `cuota:${p.id}`))
  const paymentsThisMonth = input.pending.filter(
    (p) => p.kind === "expense" && p.dueDate < firstDayNextMonth,
  )
  const paymentsNextMonth = input.pending.filter(
    (p) => p.kind === "expense" && monthKey(p.dueDate) === nextMonth,
  )

  const horizonEnd = monthRange(
    monthKey(addMonthsClamped(`${thisMonth}-01`, Math.max(0, input.horizonMonths - 1))),
  ).to
  const cashflow = buildCashflowReport({
    today,
    from: today,
    to: horizonEnd,
    granularity: "mensual",
    balances,
    pending: input.pending,
    officialRate,
  })
  const projection = cashflow.missingRateForUsd
    ? null
    : cashflow.rows.map((r) => ({ month: r.key, arsCents: r.closingCents }))

  const overdueMovements = new Set(
    input.pending.filter((p) => isOverdue(p.dueDate, today)).map((p) => p.movementId),
  )

  const inWindow = input.pending.filter((p) => p.dueDate < firstDayAfterNextMonth)

  const statements = new Map<string, UpcomingStatement>()
  for (const p of inWindow) {
    if (!p.statementId || !p.cardId) continue
    const item = statements.get(p.statementId) ?? {
      type: "statement" as const,
      id: p.statementId,
      cardId: p.cardId,
      cardName: p.cardName ?? "Tarjeta",
      period: p.statementPeriod ?? monthKey(p.dueDate),
      dueDate: p.dueDate,
      arsCents: 0,
      usdCents: 0,
      kind: "expense" as const,
      status: isOverdue(p.dueDate, today) ? ("overdue" as const) : ("pending" as const),
    }
    if (assertCurrency(p.currency) === "USD") item.usdCents += p.amountCents
    else item.arsCents += p.amountCents
    statements.set(p.statementId, item)
  }

  const upcoming: UpcomingItem[] = inWindow
    .filter((p) => !p.statementId)
    .map((p) => ({
      id: p.id,
      number: p.number,
      dueDate: p.dueDate,
      amountCents: p.amountCents,
      description: p.description,
      currency: assertCurrency(p.currency),
      kind: assertInstallmentMovementKind(p.kind),
      status: overdueMovements.has(p.movementId) ? "overdue" : "pending",
    }))

  const pieArs = spendByParent(
    monthPaid
      .filter((p) => p.kind === "expense" && assertCurrency(p.currency) === "ARS")
      .map((p) => ({ categoryId: p.categoryId, arsCents: p.amountCents })),
    input.expenseCategories,
  )
  const pieUsd = spendByParent(
    monthPaid
      .filter((p) => p.kind === "expense" && assertCurrency(p.currency) === "USD")
      .map((p) => ({ categoryId: p.categoryId, arsCents: p.amountCents })),
    input.expenseCategories,
  )

  const barsArs = monthlyTotals(
    paidSinceStart
      .filter((p) => assertCurrency(p.currency) === "ARS")
      .map((p) => ({
        date: p.paidDate,
        kind: assertInstallmentMovementKind(p.kind),
        arsCents: p.amountCents,
      })),
    input.historyMonths,
    today,
  ).map((b) => ({ month: b.month, incomeCents: b.incomeArsCents, expenseCents: b.expenseArsCents }))

  const barsUsd = monthlyTotals(
    paidSinceStart
      .filter((p) => assertCurrency(p.currency) === "USD")
      .map((p) => ({
        date: p.paidDate,
        kind: assertInstallmentMovementKind(p.kind),
        arsCents: p.amountCents,
      })),
    input.historyMonths,
    today,
  ).map((b) => ({ month: b.month, incomeCents: b.incomeArsCents, expenseCents: b.expenseArsCents }))

  const sumByCurrency = (rows: readonly { amountCents: number; currency: string }[]) => {
    let arsCents = 0
    let usdCents = 0
    for (const r of rows) {
      if (assertCurrency(r.currency) === "USD") usdCents += r.amountCents
      else arsCents += r.amountCents
    }
    return { arsCents, usdCents }
  }

  const monthIncome = sumByCurrency(monthPaid.filter((p) => p.kind === "income"))
  const monthExpense = sumByCurrency(monthPaid.filter((p) => p.kind === "expense"))
  const thisMonthSum = sumByCurrency(paymentsThisMonth)
  const nextMonthSum = sumByCurrency(paymentsNextMonth)

  return {
    arsCents: balances.arsCents,
    usdCents: balances.usdCents,
    consolidatedArsCents,
    monthIncomeArsCents: monthIncome.arsCents,
    monthIncomeUsdCents: monthIncome.usdCents,
    monthExpenseArsCents: monthExpense.arsCents,
    monthExpenseUsdCents: monthExpense.usdCents,
    paymentsThisMonth: {
      arsCents: thisMonthSum.arsCents,
      usdCents: thisMonthSum.usdCents,
      count: conceptos(paymentsThisMonth).size,
      overdueCount: conceptos(paymentsThisMonth.filter((payment) => isOverdue(payment.dueDate, today)))
        .size,
    },
    paymentsNextMonth: {
      arsCents: nextMonthSum.arsCents,
      usdCents: nextMonthSum.usdCents,
      count: conceptos(paymentsNextMonth).size,
    },
    projection,
    upcomingPayments: [
      ...upcoming.filter((item) => item.kind === "expense"),
      ...statements.values(),
    ]
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
      .slice(0, MAX_UPCOMING),
    upcomingReceivables: upcoming.filter((item) => item.kind === "income").slice(0, MAX_UPCOMING),
    pie: { ars: pieArs, usd: pieUsd },
    bars: { ars: barsArs, usd: barsUsd },
    officialRate,
  }
}
