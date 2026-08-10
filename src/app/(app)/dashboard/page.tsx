import { BalanceCards } from "@/components/dashboard/balance-cards"
import { CategoryPie, MonthlyBars, ProjectionChart } from "@/components/dashboard/charts"
import { Upcoming } from "@/components/dashboard/upcoming"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { computeBalances } from "@/lib/balance"
import {
  monthlyTotals,
  projectBalance,
  projectionStartArsCents,
  spendByCategory,
} from "@/lib/dashboard"
import { addMonthsClamped, monthKey, todayInAr } from "@/lib/dates"
import { convertToArs } from "@/lib/money"
import {
  assertCurrency,
  assertExchangeDirection,
  assertInstallmentMovementKind,
} from "@/lib/movement-asserts"
import { getMovementStatus } from "@/lib/movement-status"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import {
  listCategories,
  listExchanges,
  listMovements,
  listPaidInstallments,
  listPendingInstallments,
} from "@/server/queries"
import { requireSettings } from "@/server/session"

const HORIZON_MONTHS = 6
const HISTORY_MONTHS = 12

export default async function DashboardPage() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [paid, exchanges, pending, movements, expenseCategories, rate] = await Promise.all([
    listPaidInstallments(user.id),
    listExchanges(user.id),
    listPendingInstallments(user.id),
    listMovements(user.id),
    // "expense" + archivadas incluidas: la torta de egresos por categoría
    // tiene que poder resolver el nombre de un movimiento viejo cuya
    // categoría ya se archivó, igual que MovementList (Task 16) para
    // /egresos. listCategories() sin este segundo argumento sólo trae las
    // activas y esos movimientos caerían en "Sin categoría".
    listCategories(user.id, "expense", true),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const balances = computeBalances(
    {
      initialArsCents: settings.initialBalanceArsCents,
      initialUsdCents: settings.initialBalanceUsdCents,
      initialDate: settings.initialBalanceDate,
    },
    paid.map((p) => ({
      // `paid_date` no puede ser nulo con `paid = true`: lo garantiza la CHECK
      // `installment_paid_date_required_when_paid` (migración 0009), no este `!`.
      // Antes de esa constraint el supuesto no lo sostenía nadie y una fila
      // así hacía reventar el `monthKey(null)` de más abajo.
      paidDate: p.paidDate!,
      // Con un `as`, una moneda inesperada caía en el `else` de
      // computeBalances y sumaba al saldo en DÓLARES en silencio. Mismo
      // criterio que los dos asserts de abajo.
      currency: assertCurrency(p.currency),
      kind: assertInstallmentMovementKind(p.kind),
      amountCents: p.amountCents,
    })),
    exchanges.map((e) => ({
      date: e.date,
      // Los mismos asserts que sostiene `queries.ts`, y por el mismo motivo:
      // con un `as`, un cambio con `direction` nulo caía en el `else` de
      // computeBalances y se contaba en silencio como venta, mientras
      // /cambios reventaba con esa misma fila. Dos comportamientos opuestos
      // para el mismo dato malo.
      direction: assertExchangeDirection(e.direction),
      usdCents: e.amountCents,
      rate: Number(e.rate),
    })),
  )

  // El consolidado valúa la tenencia en dólares al TC de VENTA: lo que se
  // recibiría si se vendieran hoy, el lado conservador. No es el mismo TC que
  // usan los formularios de ingresos/egresos (referenceRate): ahí se
  // precarga la cotización de una operación puntual, acá se está valuando un
  // saldo ya existente.
  const todayRate = rate?.sellRate ?? null
  const consolidated =
    todayRate === null ? null : balances.arsCents + convertToArs(balances.usdCents, todayRate)

  // Todo lo que no sea ARS se consolida con el rate del propio movimiento.
  const toArs = (cents: number, currency: string, movementRate: string) =>
    currency === "ARS" ? cents : convertToArs(cents, Number(movementRate))

  const thisMonth = monthKey(today)
  // El `!` lo sostiene la misma CHECK de la migración 0009: estas filas vienen
  // todas con `paid = true`.
  const monthPaid = paid.filter((p) => monthKey(p.paidDate!) === thisMonth)

  // La proyección arranca del saldo CONSOLIDADO, no del saldo en pesos: lo que
  // se le aplica son cuotas ya convertidas a pesos, así que el punto de partida
  // tiene que estar en esa misma escala. Puede ser null si hay dólares en el
  // saldo y la cotización de hoy no está disponible.
  const projectionStart = projectionStartArsCents(balances, todayRate)

  const projection =
    projectionStart === null
      ? null
      : projectBalance(
          projectionStart,
          pending.map((p) => ({
            dueDate: p.dueDate,
            arsCents: toArs(p.amountCents, p.currency, p.rate),
            kind: assertInstallmentMovementKind(p.kind),
          })),
          HORIZON_MONTHS,
          today,
        )

  // Vencimientos: lo atrasado más lo que vence dentro de un mes.
  //
  // El estado del enlace se deriva del MOVIMIENTO entero, no de la cuota de la
  // fila: es el mismo criterio que usa el filtro de /ingresos y /egresos. Un
  // movimiento con una cuota atrasada y otra por vencer es "overdue" completo,
  // así que la fila de la cuota que todavía no venció también tiene que llevar
  // a esa lista — si no, el enlace deja al usuario en una lista donde el
  // movimiento que venía a ver no está.
  const statusByMovement = new Map(
    movements.map((m) => [m.id, getMovementStatus(m.installments, today)]),
  )

  const limit = addMonthsClamped(today, 1)
  const upcoming = pending
    .filter((p) => p.dueDate <= limit)
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      number: p.number,
      dueDate: p.dueDate,
      amountCents: p.amountCents,
      description: p.description,
      currency: assertCurrency(p.currency),
      kind: assertInstallmentMovementKind(p.kind),
      status: statusByMovement.get(p.movementId) ?? "pending",
    }))

  const expenseMovements = movements.filter((m) => m.kind === "expense")

  const pie = spendByCategory(
    expenseMovements
      .filter((m) => monthKey(m.date) === thisMonth)
      .map((m) => ({
        categoryId: m.categoryId,
        arsCents: toArs(m.amountCents, m.currency, m.rate),
      })),
    expenseCategories,
  )

  const bars = monthlyTotals(
    movements
      .filter((m) => m.kind !== "exchange")
      .map((m) => ({
        date: m.date,
        kind: assertInstallmentMovementKind(m.kind),
        arsCents: toArs(m.amountCents, m.currency, m.rate),
      })),
    HISTORY_MONTHS,
    today,
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <BalanceCards
        arsCents={balances.arsCents}
        usdCents={balances.usdCents}
        consolidatedArsCents={consolidated}
        rate={todayRate}
        monthIncomeArsCents={monthPaid
          .filter((p) => p.kind === "income")
          .reduce((a, p) => a + toArs(p.amountCents, p.currency, p.rate), 0)}
        monthExpenseArsCents={monthPaid
          .filter((p) => p.kind === "expense")
          .reduce((a, p) => a + toArs(p.amountCents, p.currency, p.rate), 0)}
      />

      <Upcoming items={upcoming} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Saldo proyectado al cierre de cada mes ({HORIZON_MONTHS} meses)
            </CardTitle>
            <CardDescription className="text-xs">
              Arranca de tu saldo de hoy consolidado en pesos y le va aplicando las cuotas
              pendientes por su vencimiento. El primer punto ya tiene descontado lo que vence
              este mes y lo que está atrasado: no es tu saldo de hoy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {projection === null ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Hoy no pudimos traer la cotización del dólar, así que no podemos consolidar tu
                saldo en pesos para arrancar la proyección. Probá de nuevo en un rato.
              </p>
            ) : (
              <ProjectionChart data={projection} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Gastos que cargaste este mes, por categoría
            </CardTitle>
            <CardDescription className="text-xs">
              Cuenta el importe total de cada gasto en el mes de su fecha, aunque lo pagues en
              cuotas más adelante. Un televisor de $1.200.000 en 12 cuotas entra entero acá, y
              de a una cuota en &ldquo;Cobrado y pagado este mes&rdquo;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryPie data={pie} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lo que cargaste en los últimos {HISTORY_MONTHS} meses
          </CardTitle>
          <CardDescription className="text-xs">
            Con el mismo criterio que la torta: el importe total de cada movimiento en el mes
            de su fecha, no lo que se pagó o se cobró cada mes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars data={bars} />
        </CardContent>
      </Card>
    </div>
  )
}
