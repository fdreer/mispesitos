import { computeBalances } from "@/lib/balance"
import {
  monthlyTotals,
  projectBalance,
  projectionStartArsCents,
  spendByCategory,
} from "@/lib/dashboard"
import { addMonthsClamped, isOverdue, monthKey, type IsoDate } from "@/lib/dates"
import { convertToArs } from "@/lib/money"
import {
  assertCurrency,
  assertExchangeDirection,
  assertInstallmentMovementKind,
} from "@/lib/movement-asserts"
import type { MovementStatus } from "@/lib/movement-status"

/**
 * Todo el armado de datos del dashboard, sin tocar la base ni React. La página
 * queda de orquestadora: trae las filas, llama acá, pinta lo que sale.
 *
 * Vive separada por el mismo motivo que `buildUsdPositionEvents` (@/lib/position)
 * se separó de `listUsdPositionEvents`: es la parte que tiene reglas y que se
 * puede probar con filas armadas a mano, en milisegundos y sin red.
 *
 * Las filas entran CRUDAS, tal como salen de Drizzle: `rate` es el `numeric` de
 * Postgres, o sea string, y `kind`/`currency`/`direction` son `text`, o sea
 * string. La conversión y los asserts pasan una sola vez, acá adentro.
 */

/**
 * Cuota pagada, del join con su movimiento. `paidDate` no es `string | null`
 * porque `listPaidInstallments` (@/server/queries) ya filtra `paid = true`, y
 * con `paid = true` la CHECK `installment_paid_date_required_when_paid`
 * (migración 0009) exige `paid_date` no nulo. El compilador sostiene ahora lo
 * que antes sostenía sólo un comentario al lado de un `!`.
 */
type PaidRow = {
  paidDate: IsoDate
  amountCents: number
  currency: string
  kind: string
  rate: string
}

/** Movimiento de tipo exchange. */
type ExchangeRow = {
  date: IsoDate
  amountCents: number
  rate: string
  direction: string | null
}

/** Cuota impaga, del join con su movimiento. */
type PendingRow = {
  id: string
  number: number
  dueDate: IsoDate
  amountCents: number
  movementId: string
  description: string
  currency: string
  rate: string
  kind: string
}

/**
 * Movimiento, sin sus cuotas: el armado ya no las necesita. El estado de cada
 * enlace sale de `pending`, que es la lista completa de cuotas impagas.
 */
type MovementRow = {
  id: string
  date: IsoDate
  kind: string
  categoryId: string | null
  currency: string
  amountCents: number
  rate: string
}

export type DashboardInput = {
  today: IsoDate
  settings: {
    initialBalanceArsCents: number
    initialBalanceUsdCents: number
    initialBalanceDate: IsoDate
  }
  /** TC de VENTA del día, o null si la API de terceros no respondió. */
  todayRate: number | null
  paid: PaidRow[]
  exchanges: ExchangeRow[]
  pending: PendingRow[]
  movements: MovementRow[]
  expenseCategories: { id: string; name: string }[]
  horizonMonths: number
  historyMonths: number
}

/**
 * Una fila de la tarjeta de vencimientos. Exportado porque `Upcoming`
 * (@/components/dashboard/upcoming) lo consume: antes lo redeclaraba campo por
 * campo, dos definiciones de la misma forma que el compilador no sincroniza.
 */
export type UpcomingItem = {
  id: string
  number: number
  dueDate: IsoDate
  amountCents: number
  description: string
  currency: "ARS" | "USD"
  kind: "income" | "expense"
  /** Estado del MOVIMIENTO entero, no de esta cuota. */
  status: MovementStatus
}

type DashboardView = {
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  monthIncomeArsCents: number
  monthExpenseArsCents: number
  paymentsThisMonth: { arsCents: number; count: number; overdueCount: number }
  paymentsNextMonth: { arsCents: number; count: number }
  projection: { month: string; arsCents: number }[] | null
  upcomingPayments: UpcomingItem[]
  upcomingReceivables: UpcomingItem[]
  pie: { name: string; arsCents: number }[]
  bars: { month: string; incomeArsCents: number; expenseArsCents: number }[]
  todayRate: number | null
}

/** Cuántos vencimientos entran en la tarjeta antes de que sea una lista y no un aviso. */
const MAX_UPCOMING = 20

export function buildDashboardView(input: DashboardInput): DashboardView {
  const { today, settings, todayRate } = input

  // Todo lo que no sea ARS se consolida con el rate del propio movimiento.
  const toArs = (cents: number, currency: string, movementRate: string) =>
    currency === "ARS" ? cents : convertToArs(cents, Number(movementRate))

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

  // El consolidado valúa la tenencia en dólares al TC de VENTA: lo que se
  // recibiría si se vendieran hoy, el lado conservador.
  const consolidatedArsCents =
    todayRate === null ? null : balances.arsCents + convertToArs(balances.usdCents, todayRate)

  const thisMonth = monthKey(today)
  const nextMonth = monthKey(addMonthsClamped(today, 1))
  const firstDayNextMonth = `${nextMonth}-01`
  const firstDayAfterNextMonth = `${monthKey(addMonthsClamped(today, 2))}-01`

  // El MISMO corte que hace `computeBalances`, y por el mismo motivo: lo pagado
  // antes del saldo inicial ya está adentro de ese saldo. Sin este filtro, con
  // un saldo inicial fechado a mitad de mes la tarjeta mostraba un cobro que el
  // saldo de al lado no tenía en cuenta.
  const monthPaid = input.paid.filter(
    (p) => p.paidDate >= settings.initialBalanceDate && monthKey(p.paidDate) === thisMonth,
  )
  const paymentsThisMonth = input.pending.filter(
    (p) => p.kind === "expense" && p.dueDate < firstDayNextMonth,
  )
  const paymentsNextMonth = input.pending.filter(
    (p) => p.kind === "expense" && monthKey(p.dueDate) === nextMonth,
  )

  const projectionStart = projectionStartArsCents(balances, todayRate)
  const projection =
    projectionStart === null
      ? null
      : projectBalance(
          projectionStart,
          input.pending.map((p) => ({
            dueDate: p.dueDate,
            arsCents: toArs(p.amountCents, p.currency, p.rate),
            kind: assertInstallmentMovementKind(p.kind),
          })),
          input.horizonMonths,
          today,
        )

  /*
   * El estado del enlace se deriva del MOVIMIENTO entero, no de la cuota de la
   * fila: es el mismo criterio que usa el filtro de /ingresos y /egresos. Un
   * movimiento con una cuota atrasada y otra por vencer es "overdue" completo,
   * así que la fila de la cuota que todavía no venció también tiene que llevar
   * a esa lista — si no, el enlace deja al usuario en una lista donde el
   * movimiento que venía a ver no está.
   *
   * Sale de `pending` y no de la lista de movimientos, y da exactamente lo
   * mismo que `getMovementStatus`: un movimiento que aparece acá tiene al menos
   * una cuota impaga, así que nunca es "paid"; y TODAS sus cuotas impagas están
   * en esta lista, así que "hay alguna vencida" se responde sin mirar nada más.
   * Es lo que permite que la página deje de traerse la historia entera.
   */
  const overdueMovements = new Set(
    input.pending.filter((p) => isOverdue(p.dueDate, today)).map((p) => p.movementId),
  )

  // Vencimientos: lo atrasado más los meses actual y siguiente completos.
  const upcoming: UpcomingItem[] = input.pending
    .filter((p) => p.dueDate < firstDayAfterNextMonth)
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

  const pie = spendByCategory(
    input.movements
      .filter((m) => m.kind === "expense" && monthKey(m.date) === thisMonth)
      .map((m) => ({
        categoryId: m.categoryId,
        arsCents: toArs(m.amountCents, m.currency, m.rate),
      })),
    input.expenseCategories,
  )

  const bars = monthlyTotals(
    input.movements
      .filter((m) => m.kind !== "exchange")
      .map((m) => ({
        date: m.date,
        kind: assertInstallmentMovementKind(m.kind),
        arsCents: toArs(m.amountCents, m.currency, m.rate),
      })),
    input.historyMonths,
    today,
  )

  return {
    arsCents: balances.arsCents,
    usdCents: balances.usdCents,
    consolidatedArsCents,
    monthIncomeArsCents: monthPaid
      .filter((p) => p.kind === "income")
      .reduce((a, p) => a + toArs(p.amountCents, p.currency, p.rate), 0),
    monthExpenseArsCents: monthPaid
      .filter((p) => p.kind === "expense")
      .reduce((a, p) => a + toArs(p.amountCents, p.currency, p.rate), 0),
    paymentsThisMonth: {
      arsCents: paymentsThisMonth.reduce(
        (total, payment) => total + toArs(payment.amountCents, payment.currency, payment.rate),
        0,
      ),
      count: paymentsThisMonth.length,
      overdueCount: paymentsThisMonth.filter((payment) => isOverdue(payment.dueDate, today)).length,
    },
    paymentsNextMonth: {
      arsCents: paymentsNextMonth.reduce(
        (total, payment) => total + toArs(payment.amountCents, payment.currency, payment.rate),
        0,
      ),
      count: paymentsNextMonth.length,
    },
    projection,
    upcomingPayments: upcoming.filter((item) => item.kind === "expense").slice(0, MAX_UPCOMING),
    upcomingReceivables: upcoming.filter((item) => item.kind === "income").slice(0, MAX_UPCOMING),
    pie,
    bars,
    todayRate,
  }
}
