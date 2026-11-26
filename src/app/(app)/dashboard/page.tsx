import { Suspense } from "react"
import Link from "next/link"

import { BalanceCards } from "@/components/dashboard/balance-cards"
import { CategoryPie, MonthlyBars, ProjectionChart } from "@/components/dashboard/charts"
import { Upcoming } from "@/components/dashboard/upcoming"
import { InfoHint } from "@/components/info-hint"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildDashboardView } from "@/lib/dashboard-view"
import { todayInAr } from "@/lib/dates"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import {
  listCategories,
  listExchanges,
  listPaidInstallments,
  listPendingInstallments,
} from "@/server/queries"
import { requireSettings } from "@/server/session"

const HORIZON_MONTHS = 6
const HISTORY_MONTHS = 12

/**
 * El encabezado de una tarjeta de gráfico: el título, y el criterio con el que
 * ese gráfico cuenta la plata detrás del ícono de ayuda.
 *
 * Ese criterio hay que explicarlo —los tres gráficos y las tarjetas de arriba
 * miden "el mes" de dos maneras distintas— pero impreso arriba de cada gráfico
 * ocupaba cuatro renglones de letra chica y empujaba el gráfico, que es lo que
 * la tarjeta viene a mostrar, fuera de la primera pantalla.
 */
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

/**
 * Todo lo que hay debajo del título. Va aparte, detrás de un Suspense, para
 * que el título salga en el primer flush en vez de esperar a las cuatro
 * consultas y a la cotización (que sola puede tardar 3s, ver TIMEOUT_MS en
 * @/lib/rate).
 *
 * A diferencia de /ingresos y /egresos, acá NO se puede transmitir bloque por
 * bloque: `buildDashboardView` es un solo cálculo que necesita las cuatro
 * consultas juntas —los saldos de las tarjetas alimentan el primer punto de la
 * proyección, y la torta y las barras salen de las mismas cuotas pagadas—,
 * así que partirlo en cuatro Suspense sería partir también esa función, y las
 * cuatro partes terminarían esperando lo mismo igual. Un solo límite, con un
 * esqueleto que promete la grilla de verdad, es todo lo que esta pantalla
 * puede ganar sin rehacer el cálculo.
 */
async function DashboardBody() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  /*
   * La torta y las barras salen de las cuotas pagadas (criterio de lo
   * percibido, ver @/lib/dashboard-view), que ya vienen enteras para el saldo:
   * no hace falta traer movimientos aparte.
   */
  const [paid, exchanges, pending, expenseCategories, rate] = await Promise.all([
    listPaidInstallments(user.id),
    listExchanges(user.id),
    listPendingInstallments(user.id),
    // "expense" + archivadas incluidas: la torta de egresos por categoría
    // tiene que poder resolver el nombre de un movimiento viejo cuya
    // categoría ya se archivó.
    listCategories(user.id, "expense", true),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  // Todo el armado vive en @/lib/dashboard-view, que es puro y está testeado.
  // Acá sólo se traen las filas y se pinta lo que sale.
  const view = buildDashboardView({
    today,
    settings: {
      initialBalanceArsCents: settings.initialBalanceArsCents,
      initialBalanceUsdCents: settings.initialBalanceUsdCents,
      initialBalanceDate: settings.initialBalanceDate,
    },
    // El TC de VENTA: lo que se recibiría si se vendiera hoy la tenencia. No es
    // el mismo que precargan los formularios (referenceRate).
    todayRate: rate?.sellRate ?? null,
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
        rate={view.todayRate}
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
            Arranca de tu saldo de hoy consolidado en pesos y le va aplicando las cuotas
            pendientes por su vencimiento. El primer punto ya tiene descontado lo que vence
            este mes y lo que está atrasado: no es tu saldo de hoy.
          </ChartCardHeader>
          <CardContent>
            {view.projection === null ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Hoy no pudimos traer la cotización del dólar, así que no podemos consolidar tu
                saldo en pesos para arrancar la proyección. Probá de nuevo en un rato.
              </p>
            ) : (
              <ProjectionChart data={view.projection} />
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <ChartCardHeader title="Gastos de este mes, por categoría">
            Suma lo que pagaste este mes, por la fecha de pago de cada cuota, igual que
            &ldquo;Cobrado y pagado este mes&rdquo;. Un televisor de $1.200.000 en 12 cuotas
            suma $100.000 en cada mes en que pagás una.
          </ChartCardHeader>
          <CardContent>
            <CategoryPie data={view.pie} />
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <ChartCardHeader title={`Cobrado y pagado en los últimos ${HISTORY_MONTHS} meses`}>
          Con el mismo criterio que la torta: cada cuota cobrada o pagada, en el mes de su
          fecha de pago. Lo pendiente no entra hasta que lo marcás pagado.
        </ChartCardHeader>
        <CardContent>
          <MonthlyBars data={view.bars} />
        </CardContent>
      </Card>
    </>
  )
}

/**
 * La misma grilla que arma `DashboardBody`, en gris. Los altos son los que
 * salen del contenido real (tarjeta chica, tarjeta de vencimientos, y las de
 * gráfico con su `ChartContainer` de 220px más el encabezado), así que cuando
 * llegan los datos el contenido no empuja nada hacia abajo.
 *
 * `aria-hidden`: es andamiaje, no información. Quien no ve la pantalla no
 * gana nada con que le lean cuatro cajas vacías.
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[116px] animate-pulse rounded-xl border border-border" />
        ))}
      </div>
      {/* La única que no tiene alto fijo: crece con la cantidad de
          vencimientos. 150px es lo que mide con uno. */}
      <div className="h-[150px] animate-pulse rounded-xl border border-border" />
      {/* Las tres de gráfico miden lo mismo desde que el criterio de cálculo
          dejó de imprimirse arriba del gráfico y pasó al ícono de ayuda: antes
          cada una era más alta según cuántos renglones ocupaba su explicación. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[288px] animate-pulse rounded-xl border border-border" />
        ))}
      </div>
      <div className="h-[288px] animate-pulse rounded-xl border border-border" />
    </div>
  )
}

/**
 * Sin `async`: el título sale sin esperar a nada (ver `DashboardBody` para
 * por qué el resto no se puede partir más).
 */
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
