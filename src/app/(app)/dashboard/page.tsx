import { Suspense } from "react"
import Link from "next/link"

import { KeyFigures } from "@/components/dashboard/balance-cards"
import { CategoryPie, MonthlyBars } from "@/components/dashboard/charts"
import { FundsFlow } from "@/components/dashboard/funds-flow"
import { QuickPay } from "@/components/dashboard/quick-pay"
import { InfoHint } from "@/components/info-hint"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildDashboardView, isUpcomingStatement } from "@/lib/dashboard-view"
import { addMonthsClamped, monthKey, todayInAr } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { getDashboardData } from "@/server/page-data"
import { resolveOfficialRate } from "@/server/rate"
import { requireSettings } from "@/server/session"

const HORIZON_MONTHS = 6
const HISTORY_MONTHS = 12

const LINK_CLASS =
  "text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"

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

  // El saldo se suma en la base; de las cuotas pagadas sólo hace falta la
  // ventana de los gráficos (los últimos HISTORY_MONTHS, con el actual).
  const historyFrom = `${monthKey(addMonthsClamped(today, -(HISTORY_MONTHS - 1)))}-01`

  const [data, officialRate, suggested] = await Promise.all([
    getDashboardData(user.id, settings, today, historyFrom),
    resolveOfficialRate(user.id, settings),
    // Sale en paralelo y no después: es una lectura del cache de fetch (10
    // min) y esperar a saber si hace falta sumaba una vuelta entera al render.
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const view = buildDashboardView({
    today,
    settings: {
      initialBalanceArsCents: settings.initialBalanceArsCents,
      initialBalanceUsdCents: settings.initialBalanceUsdCents,
      initialBalanceDate: settings.initialBalanceDate,
    },
    officialRate,
    balances: data.balances,
    paid: data.paid,
    pending: data.pending,
    statements: data.unpaidStatements,
    expenseCategories: data.expenseCategories,
    horizonMonths: HORIZON_MONTHS,
    historyMonths: HISTORY_MONTHS,
  })

  // La cotización sugerida sólo se usa para precargar el TC de un resumen con
  // dólares que ya se puede pagar desde la lista de pendientes.
  const needsSuggestedRate = view.upcomingPayments.some(
    (p) =>
      isUpcomingStatement(p) &&
      p.usdCents > 0 &&
      p.closingDate !== null &&
      p.closingDate <= today,
  )
  const suggestedRate = needsSuggestedRate ? suggested : null

  return (
    <>
      <KeyFigures
        today={today}
        arsCents={view.arsCents}
        usdCents={view.usdCents}
        consolidatedArsCents={view.consolidatedArsCents}
        officialRate={view.officialRate}
        committed={view.committed}
        nextCardDue={view.nextCardDue}
        paymentsThisMonth={view.paymentsThisMonth}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card size="sm">
          <ChartCardHeader
            title={`Flujo de fondos · próximos ${HORIZON_MONTHS} meses`}
            action={
              <Link href="/informes?tab=flujo" className={LINK_CLASS}>
                Ver informe
              </Link>
            }
          >
            Arranca de lo que tenés hoy (pesos más dólares al oficial comprador) y aplica mes a mes
            lo pendiente: cobros en USD al comprador, egresos en USD al vendedor y cada resumen de
            tarjeta en su vencimiento. Lo vencido va en un renglón aparte.
          </ChartCardHeader>
          <CardContent>
            <FundsFlow view={view.cashflow} />
          </CardContent>
        </Card>

        <Card size="sm">
          <ChartCardHeader title="Pendientes">
            Lo que vence este mes y el próximo, más lo vencido. Tocá el círculo para marcar una
            cuota como pagada hoy (podés deshacerlo desde el aviso) o el calendario para elegir otra
            fecha. Los resúmenes de tarjeta se pagan enteros, con el botón Pagar.
          </ChartCardHeader>
          <CardContent>
            <QuickPay
              payments={view.upcomingPayments}
              receivables={view.upcomingReceivables}
              today={today}
              statementContext={{
                officialSellRate: officialRate?.venta ?? null,
                suggestedBuyRate: suggestedRate?.buyRate ?? null,
                usdBalanceCents: view.usdCents,
              }}
            />
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="analisis" className="space-y-3 pt-2">
        <h2 id="analisis" className="text-muted-foreground text-xs font-medium">
          Análisis
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card size="sm">
            <ChartCardHeader title="Gastos de este mes, por categoría">
              Suma lo que pagaste este mes, por la fecha de pago de cada cuota, separado por moneda.
              Un resumen de tarjeta pagado con pesos cuenta en pesos; pagado con dólares, en dólares.
            </ChartCardHeader>
            <CardContent>
              <CategoryPie data={view.pie} />
            </CardContent>
          </Card>

          <Card size="sm">
            <ChartCardHeader
              title={`Cobrado y pagado · últimos ${HISTORY_MONTHS} meses`}
              action={
                <Link href="/informes?tab=ingresos-gastos" className={LINK_CLASS}>
                  Ver informe
                </Link>
              }
            >
              Con el mismo criterio que la torta: cada cuota cobrada o pagada, en el mes de su fecha
              de pago, sin mezclar monedas. Lo pendiente no entra hasta que lo marcás pagado.
            </ChartCardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                Este mes · Ingresos:{" "}
                <span className="font-medium text-foreground">
                  {formatMoney(view.monthIncomeArsCents, "ARS", 0)}
                  {view.monthIncomeUsdCents > 0 &&
                    ` · ${formatMoney(view.monthIncomeUsdCents, "USD")}`}
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
        </div>
      </section>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[128px] animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="h-[520px] animate-pulse rounded-xl bg-white/[0.03]" />
        <div className="h-[520px] animate-pulse rounded-xl bg-white/[0.03]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[320px] animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody />
      </Suspense>
    </div>
  )
}
