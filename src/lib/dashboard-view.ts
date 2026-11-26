import { computeBalances } from "@/lib/balance"
import {
  monthlyTotals,
  projectBalance,
  projectionStartArsCents,
} from "@/lib/dashboard"
import { spendByParent, type SpendGroup, type TreeCategory } from "@/lib/category-tree"
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
  categoryId: string | null
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
  /**
   * El resumen de tarjeta en el que cae la cuota, si la compra es con
   * tarjeta (§1.4 del plan v2). Opcionales para que las filas sin tarjeta
   * —y los tests anteriores a la Fase 3— no tengan que traerlos.
   */
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
  /** TC de VENTA del día, o null si la API de terceros no respondió. */
  todayRate: number | null
  paid: PaidRow[]
  exchanges: ExchangeRow[]
  pending: PendingRow[]
  /** Con las archivadas: la torta tiene que poder nombrar un gasto viejo. */
  expenseCategories: TreeCategory[]
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

/**
 * Un resumen de tarjeta como UN renglón de vencimientos (§1.4 del plan v2):
 * "Visa Galicia · vence 10/12 · $480.000", no cada cuota suelta. Se paga
 * desde /tarjetas, así que el renglón enlaza ahí en lugar de tener botón.
 *
 * Comparte `id`, `dueDate`, `kind` y `status` con `UpcomingItem` para que la
 * lista se pueda ordenar y filtrar sin preguntar qué es cada cosa.
 */
export type UpcomingStatement = {
  type: "statement"
  /** El id del resumen. */
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

type DashboardView = {
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  monthIncomeArsCents: number
  monthExpenseArsCents: number
  paymentsThisMonth: { arsCents: number; count: number; overdueCount: number }
  paymentsNextMonth: { arsCents: number; count: number }
  projection: { month: string; arsCents: number }[] | null
  upcomingPayments: UpcomingPayment[]
  upcomingReceivables: UpcomingItem[]
  /** Por categoría padre, con el desglose por subcategoría (§2.3 del plan v2). */
  pie: SpendGroup[]
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

  /*
   * Criterio de lo percibido (§0 del plan v2): la tarjeta del mes, la torta y
   * las barras cuentan lo mismo, cuotas PAGADAS por su `paidDate`. Un
   * televisor de $1.200.000 en 12 cuotas suma $100.000 en cada mes en que se
   * paga una, no $1.200.000 el día que se cargó.
   *
   * Y con el MISMO corte que hace `computeBalances`, y por el mismo motivo: lo
   * pagado antes del saldo inicial ya está adentro de ese saldo. Sin este
   * filtro, con un saldo inicial fechado a mitad de mes la tarjeta mostraba un
   * cobro que el saldo de al lado no tenía en cuenta. Aplicado una sola vez
   * acá, la torta y la barra del mes en curso suman exactamente lo que la
   * tarjeta.
   */
  const paidSinceStart = input.paid.filter((p) => p.paidDate >= settings.initialBalanceDate)
  const monthPaid = paidSinceStart.filter((p) => monthKey(p.paidDate) === thisMonth)
  /*
   * Lo que hay que pagar, contado por CONCEPTO: una cuota suelta es uno, y un
   * resumen de tarjeta también es uno aunque tenga veinte cuotas adentro
   * (§1.4 del plan v2). Todas las cuotas de un resumen vencen el mismo día,
   * así que cae entero en un mes o en el otro. El importe se suma igual,
   * cuota por cuota.
   */
  const conceptos = (rows: PendingRow[]) =>
    new Set(rows.map((p) => p.statementId ?? `cuota:${p.id}`))
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
  const inWindow = input.pending.filter((p) => p.dueDate < firstDayAfterNextMonth)

  // Las cuotas con tarjeta se juntan en su resumen: un renglón por resumen,
  // con el total por moneda. El estado es el del resumen: vencido si su
  // vencimiento ya pasó.
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

  const pie = spendByParent(
    monthPaid
      .filter((p) => p.kind === "expense")
      .map((p) => ({
        categoryId: p.categoryId,
        arsCents: toArs(p.amountCents, p.currency, p.rate),
      })),
    input.expenseCategories,
  )

  const bars = monthlyTotals(
    paidSinceStart.map((p) => ({
      date: p.paidDate,
      kind: assertInstallmentMovementKind(p.kind),
      arsCents: toArs(p.amountCents, p.currency, p.rate),
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
      count: conceptos(paymentsThisMonth).size,
      overdueCount: conceptos(paymentsThisMonth.filter((payment) => isOverdue(payment.dueDate, today)))
        .size,
    },
    paymentsNextMonth: {
      arsCents: paymentsNextMonth.reduce(
        (total, payment) => total + toArs(payment.amountCents, payment.currency, payment.rate),
        0,
      ),
      count: conceptos(paymentsNextMonth).size,
    },
    projection,
    // `pending` llega ordenado por vencimiento; al sumar los resúmenes hay
    // que volver a ordenar. `sort` es estable: entre iguales queda el orden
    // de la consulta.
    upcomingPayments: [
      ...upcoming.filter((item) => item.kind === "expense"),
      ...statements.values(),
    ]
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
      .slice(0, MAX_UPCOMING),
    upcomingReceivables: upcoming.filter((item) => item.kind === "income").slice(0, MAX_UPCOMING),
    pie,
    bars,
    todayRate,
  }
}
