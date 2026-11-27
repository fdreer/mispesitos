import { Suspense } from "react"
import Link from "next/link"

import { BalanceCards } from "@/components/dashboard/balance-cards"
import { CategoryPie, MonthlyBars, ProjectionChart } from "@/components/dashboard/charts"
import { Upcoming } from "@/components/dashboard/upcoming"
import { InfoHint } from "@/components/info-hint"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildDashboardView } from "@/lib/dashboard-view"
import { todayInAr } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import {
  listCategories,
  listExchanges,
  listPaidInstallments,
  listPendingInstallments,
} from "@/server/queries"
import { resolveOfficialRate } from "@/server/rate"
import { requireSettings } from "@/server/session"

const HORIZON_MONTHS = 6
const HISTORY_MONTHS = 12

function ChartCardHeader({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-1.5 text-base">
        {title}
        <InfoHint label={`Cómo se calcula: ${title}`}>{children}</InfoHint>
      </CardTitle>
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
  )
}

async function DashboardBody() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [paid, exchanges, pending, expenseCategories, officialRate] = await Promise.all([
    listPaidInstallments(user.id),
    listExchanges(user.id),
    listPendingInstallments(user.id),
    listCategories(user.id, "expense", true),
    resolveOfficialRate(user.id, settings),
  ])

  const view = buildDashboardView({
    today,
    settings: {
      initialBalanceArsCents: settings.initialBalanceArsCents,
      initialBalanceUsdCents: settings.initialBalanceUsdCents,
      initialBalanceDate: settings.initialBalanceDate,
    },
    officialRate,
    paid,
    exchanges: exchanges.map((e) => ({
      date: e.date,
      amountCents: e.amountCents,
      rate: e.rate,
      direction: e.direction,
    })),
    pending,
    expenseCategories,
    horizonMonths: HORIZON_MONTHS,
    historyMonths: HISTORY_MONTHS,
  })

  return (
    <>
      <BalanceCards
        arsCents={view.arsCents}
        usdCents={view.usdCents}
        consolidatedArsCents={view.consolidatedArsCents}
        officialRate={view.officialRate}
        paymentsThisMonth={view.paymentsThisMonth}
        paymentsNextMonth={view.paymentsNextMonth}
      />

      <Upcoming
        payments={view.upcomingPayments}
        receivables={view.upcomingReceivables}
        today={today}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <ChartCardHeader
            title={`Saldo proyectado a ${HORIZON_MONTHS} meses`}
            action={
              <Link
                href="/informes?tab=flujo"
                className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
              >
                Ver informe
              </Link>
            }
          >
            Usa el mismo cálculo que el informe de Flujo de caja: arranca de tu saldo en pesos más
            tus dólares al oficial comprador y aplica los pendientes desde hoy hacia adelante (ingresos
            en USD al comprador, egresos en USD al vendedor). Lo atrasado queda aparte.
          </ChartCardHeader>
          <CardContent>
            {view.projection === null ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Hoy no pudimos traer la cotización oficial del dólar y todavía no hay una guardada,
                así que no podemos consolidar los dólares en la proyección. Probá de nuevo en un rato.
              </p>
            ) : (
              <ProjectionChart data={view.projection} />
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <ChartCardHeader title="Gastos de este mes, por categoría">
            Suma lo que pagaste este mes, por la fecha de pago de cada cuota, separado por moneda.
            Un resumen de tarjeta pagado con pesos cuenta en pesos; pagado con dólares, en dólares.
          </ChartCardHeader>
          <CardContent>
            <CategoryPie data={view.pie} />
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <ChartCardHeader title={`Cobrado y pagado en los últimos ${HISTORY_MONTHS} meses`}>
          Con el mismo criterio que la torta: cada cuota cobrada o pagada, en el mes de su fecha de
          pago, sin mezclar monedas. Lo pendiente no entra hasta que lo marcás pagado.
        </ChartCardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            Este mes · Ingresos:{" "}
            <span className="font-medium text-foreground">
              {formatMoney(view.monthIncomeArsCents, "ARS", 0)}
              {view.monthIncomeUsdCents > 0 && ` · ${formatMoney(view.monthIncomeUsdCents, "USD")}`}
            </span>
            {" · "}Gastos:{" "}
            <span className="font-medium text-foreground">
              {formatMoney(view.monthExpenseArsCents, "ARS", 0)}
              {view.monthExpenseUsdCents > 0 &&
                ` · ${formatMoney(view.monthExpenseUsdCents, "USD")}`}
            </span>
          </p>
          <MonthlyBars data={view.bars} />
        </CardContent>
      </Card>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[116px] animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-[150px] animate-pulse rounded-xl bg-white/[0.03]" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[288px] animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-[288px] animate-pulse rounded-xl bg-white/[0.03]" />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-paper">Dashboard</h1>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody />
      </Suspense>
    </div>
  )
}
