import { computeBalances, type Balances } from "@/lib/balance"
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
import { buildCashflowReport, type CashflowReportView } from "@/lib/reports-cashflow"

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
  /**
   * El saldo de hoy ya calculado (`getBalances` lo suma en la base). Sin él se
   * calcula con `paid` y `exchanges`, que entonces tienen que traer TODA la
   * historia; con él, `paid` alcanza con la ventana de los gráficos.
   */
  balances?: Balances
  paid: PaidRow[]
  /** Sólo hacen falta sin `balances`. */
  exchanges?: ExchangeRow[]
  pending: PendingRow[]
  /** Las fechas de cierre de los resúmenes, para saber si ya se pueden pagar. */
  statements?: readonly { id: string; closingDate: IsoDate }[]
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
  /** Null si no sabemos cuándo cierra (no vino en `statements`). */
  closingDate: IsoDate | null
  arsCents: number
  usdCents: number
  /** Cuotas impagas que lo componen. */
  count: number
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

/** Lo comprometido desde hoy hasta el final del horizonte, en pesos. */
export type CommittedFunds = {
  /** Egresos pendientes del horizonte más lo atrasado, con USD al oficial vendedor. */
  totalCents: number
  overdueCents: number
  /** Cobros pendientes del mismo horizonte (USD al comprador), para contrastar. */
  incomingCents: number
  /** Egresos en dólares que no se pudieron convertir por falta de cotización. */
  unconvertedUsdCents: number
  /** Último mes del horizonte, como "abr 2027". */
  untilLabel: string | null
}

export type NextCardDue = UpcomingStatement & {
  usdInArsCents: number | null
  /** Otros resúmenes impagos que vencen después. */
  laterCount: number
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
  cashflow: CashflowReportView
  committed: CommittedFunds
  nextCardDue: NextCardDue | null
  upcomingPayments: UpcomingPayment[]
  upcomingReceivables: UpcomingItem[]
  pie: { ars: SpendGroup[]; usd: SpendGroup[] }
  bars: { ars: MonthlyBarPoint[]; usd: MonthlyBarPoint[] }
  officialRate: OfficialRateSnapshot | null
}

const MAX_UPCOMING = 30

const byDueDate = (a: { dueDate: IsoDate }, b: { dueDate: IsoDate }) =>
  a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0

export function buildDashboardView(input: DashboardInput): DashboardView {
  const { today, settings, officialRate } = input

  const balances =
    input.balances ??
    computeBalances(
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
      (input.exchanges ?? []).map((e) => ({
        date: e.date,
        direction: assertExchangeDirection(e.direction),
        usdCents: e.amountCents,
        rate: Number(e.rate),
      })),
      today,
    )

  const consolidatedArsCents =
    officialRate === null
      ? null
      : balances.arsCents + convertToArs(balances.usdCents, officialRate.compra)

  const thisMonth = monthKey(today)
  const nextMonth = monthKey(addMonthsClamped(today, 1))
  const firstDayNextMonth = `${nextMonth}-01`
  const firstDayAfterNextMonth = `${monthKey(addMonthsClamped(today, 2))}-01`

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

  // Pasada única sobre `input.paid` desde `initialBalanceDate`: totales del mes, pie y barras.
  let monthIncomeArsCents = 0
  let monthIncomeUsdCents = 0
  let monthExpenseArsCents = 0
  let monthExpenseUsdCents = 0
  const pieArsInput: { categoryId: string | null; arsCents: number }[] = []
  const pieUsdInput: { categoryId: string | null; arsCents: number }[] = []
  const barsArsInput: { date: IsoDate; kind: "income" | "expense"; arsCents: number }[] = []
  const barsUsdInput: { date: IsoDate; kind: "income" | "expense"; arsCents: number }[] = []

  for (const p of input.paid) {
    if (p.paidDate < settings.initialBalanceDate) continue
    const currency = assertCurrency(p.currency)
    const kind = assertInstallmentMovementKind(p.kind)
    const barRow = { date: p.paidDate, kind, arsCents: p.amountCents }
    if (currency === "USD") barsUsdInput.push(barRow)
    else barsArsInput.push(barRow)

    if (monthKey(p.paidDate) !== thisMonth) continue
    if (kind === "income") {
      if (currency === "USD") monthIncomeUsdCents += p.amountCents
      else monthIncomeArsCents += p.amountCents
    } else {
      if (currency === "USD") {
        monthExpenseUsdCents += p.amountCents
        pieUsdInput.push({ categoryId: p.categoryId, arsCents: p.amountCents })
      } else {
        monthExpenseArsCents += p.amountCents
        pieArsInput.push({ categoryId: p.categoryId, arsCents: p.amountCents })
      }
    }
  }

  // Pasada única sobre `input.pending`: pagos este/próximo mes, vencidos, resúmenes y USD sin cotización.
  const closingById = new Map((input.statements ?? []).map((st) => [st.id, st.closingDate]))
  const statementsMap = new Map<string, UpcomingStatement>()
  const overdueMovements = new Set<string>()
  const thisMonthConcepts = new Set<string>()
  const thisMonthOverdueConcepts = new Set<string>()
  const nextMonthConcepts = new Set<string>()
  let thisMonthArsCents = 0
  let thisMonthUsdCents = 0
  let nextMonthArsCents = 0
  let nextMonthUsdCents = 0
  let unconvertedUsdCents = 0
  const inWindowNonStatement: PendingRow[] = []

  for (const p of input.pending) {
    const currency = assertCurrency(p.currency)
    const overdue = isOverdue(p.dueDate, today)
    if (overdue) overdueMovements.add(p.movementId)

    if (p.kind === "expense") {
      if (officialRate === null && p.dueDate <= horizonEnd && currency === "USD") {
        unconvertedUsdCents += p.amountCents
      }
      if (p.dueDate < firstDayNextMonth) {
        const concept = p.statementId ?? `cuota:${p.id}`
        thisMonthConcepts.add(concept)
        if (overdue) thisMonthOverdueConcepts.add(concept)
        if (currency === "USD") thisMonthUsdCents += p.amountCents
        else thisMonthArsCents += p.amountCents
      } else if (monthKey(p.dueDate) === nextMonth) {
        nextMonthConcepts.add(p.statementId ?? `cuota:${p.id}`)
        if (currency === "USD") nextMonthUsdCents += p.amountCents
        else nextMonthArsCents += p.amountCents
      }
    }

    if (p.statementId && p.cardId) {
      let item = statementsMap.get(p.statementId)
      if (!item) {
        item = {
          type: "statement" as const,
          id: p.statementId,
          cardId: p.cardId,
          cardName: p.cardName ?? "Tarjeta",
          period: p.statementPeriod ?? monthKey(p.dueDate),
          dueDate: p.dueDate,
          closingDate: closingById.get(p.statementId) ?? null,
          arsCents: 0,
          usdCents: 0,
          count: 0,
          kind: "expense" as const,
          status: overdue ? ("overdue" as const) : ("pending" as const),
        }
        statementsMap.set(p.statementId, item)
      }
      if (currency === "USD") item.usdCents += p.amountCents
      else item.arsCents += p.amountCents
      item.count += 1
    } else if (p.dueDate < firstDayAfterNextMonth) {
      inWindowNonStatement.push(p)
    }
  }

  const committed: CommittedFunds = {
    totalCents:
      cashflow.rows.reduce((acc, r) => acc + r.outflowsCents, 0) + cashflow.overdue.expenseCents,
    overdueCents: cashflow.overdue.expenseCents,
    incomingCents:
      cashflow.rows.reduce((acc, r) => acc + r.inflowsCents, 0) + cashflow.overdue.incomeCents,
    unconvertedUsdCents,
    untilLabel: cashflow.rows.at(-1)?.label ?? null,
  }

  const allStatements = [...statementsMap.values()].sort(byDueDate)
  const statements = allStatements.filter((s) => s.dueDate < firstDayAfterNextMonth)
  const nextStatement = allStatements[0]
  const nextCardDue: NextCardDue | null = nextStatement
    ? {
        ...nextStatement,
        usdInArsCents:
          nextStatement.usdCents > 0 && officialRate !== null
            ? convertToArs(nextStatement.usdCents, officialRate.venta)
            : null,
        laterCount: allStatements.length - 1,
      }
    : null

  const upcoming: UpcomingItem[] = inWindowNonStatement.map((p) => ({
    id: p.id,
    number: p.number,
    dueDate: p.dueDate,
    amountCents: p.amountCents,
    description: p.description,
    currency: assertCurrency(p.currency),
    kind: assertInstallmentMovementKind(p.kind),
    status: overdueMovements.has(p.movementId) ? "overdue" : "pending",
  }))

  const pieArs = spendByParent(pieArsInput, input.expenseCategories)
  const pieUsd = spendByParent(pieUsdInput, input.expenseCategories)

  const barsArs = monthlyTotals(barsArsInput, input.historyMonths, today).map((b) => ({
    month: b.month,
    incomeCents: b.incomeArsCents,
    expenseCents: b.expenseArsCents,
  }))

  const barsUsd = monthlyTotals(barsUsdInput, input.historyMonths, today).map((b) => ({
    month: b.month,
    incomeCents: b.incomeArsCents,
    expenseCents: b.expenseArsCents,
  }))

  return {
    arsCents: balances.arsCents,
    usdCents: balances.usdCents,
    consolidatedArsCents,
    monthIncomeArsCents,
    monthIncomeUsdCents,
    monthExpenseArsCents,
    monthExpenseUsdCents,
    paymentsThisMonth: {
      arsCents: thisMonthArsCents,
      usdCents: thisMonthUsdCents,
      count: thisMonthConcepts.size,
      overdueCount: thisMonthOverdueConcepts.size,
    },
    paymentsNextMonth: {
      arsCents: nextMonthArsCents,
      usdCents: nextMonthUsdCents,
      count: nextMonthConcepts.size,
    },
    cashflow,
    committed,
    nextCardDue,
    upcomingPayments: [
      ...upcoming.filter((item) => item.kind === "expense"),
      ...statements,
    ]
      .sort(byDueDate)
      .slice(0, MAX_UPCOMING),
    upcomingReceivables: upcoming.filter((item) => item.kind === "income").slice(0, MAX_UPCOMING),
    pie: { ars: pieArs, usd: pieUsd },
    bars: { ars: barsArs, usd: barsUsd },
    officialRate,
  }
}
