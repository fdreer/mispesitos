import { Suspense } from "react"

import { MovementFilters, MovementFiltersSkeleton } from "@/components/movement-filters"
import { CashflowReport } from "@/components/reports/cashflow-report"
import { PnlReport } from "@/components/reports/pnl-report"
import { ReportControls } from "@/components/reports/report-controls"
import { addMonthsClamped, formatIsoForDisplay, monthKey, todayInAr, type IsoDate } from "@/lib/dates"
import { hayFiltrosActivos } from "@/lib/movement-query"
import {
  effectiveCashflowRange,
  effectivePnlRange,
  parseReportQuery,
  reportExtraParams,
  type ReportQuery,
} from "@/lib/report-query"
import { buildCashflowReport } from "@/lib/reports-cashflow"
import { buildPnlReport, monthsInRange } from "@/lib/reports-pnl"
import { listCardOptions } from "@/server/card-queries"
import { getCashflowData } from "@/server/page-data"
import { listCategories, listPaidInstallmentsForReport } from "@/server/queries"
import { resolveOfficialRate } from "@/server/rate"
import { requireSettings } from "@/server/session"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

async function BarraDeFiltros({
  reportQuery,
  today,
}: {
  reportQuery: ReportQuery
  today: IsoDate
}) {
  const { user } = await requireSettings()
  const isFlow = reportQuery.tab === "flujo"

  if (isFlow && reportQuery.granularity === "semanal") {
    const range = effectiveCashflowRange(
      reportQuery.filters.from,
      reportQuery.filters.to,
      reportQuery.granularity,
      today,
    )
    return (
      <p className="text-muted-foreground text-sm">
        Vista semanal proyectada para los próximos 3 meses ({formatIsoForDisplay(range.from)} –{" "}
        {formatIsoForDisplay(range.to)}).
      </p>
    )
  }

  const [categories, cards] = isFlow
    ? [[], []]
    : await Promise.all([
        listCategories(user.id, undefined, true),
        listCardOptions(user.id, today),
      ])

  return (
    <MovementFilters
      basePath="/informes"
      query={reportQuery.filters}
      today={today}
      categories={categories}
      cards={cards}
      showPaymentMethod={!isFlow && cards.length > 0}
      showSort={false}
      showStatus={false}
      showCurrency={false}
      showSearch={!isFlow}
      showCategory={!isFlow}
      showAmount={!isFlow}
      showPeriod
      periodPlaceholder={isFlow ? "Próximos 6 meses" : "Últimos 12 meses"}
      extraParams={reportExtraParams(reportQuery)}
    />
  )
}

async function InformeBody({
  reportQuery,
  today,
}: {
  reportQuery: ReportQuery
  today: IsoDate
}) {
  const { user, settings } = await requireSettings()

  if (reportQuery.tab === "flujo") {
    const range = effectiveCashflowRange(
      reportQuery.filters.from,
      reportQuery.filters.to,
      reportQuery.granularity,
      today,
    )

    const [{ balances, pending }, officialRate] = await Promise.all([
      getCashflowData(user.id, settings, today),
      resolveOfficialRate(user.id, settings),
    ])

    const view = buildCashflowReport({
      today,
      from: range.from,
      to: range.to,
      granularity: reportQuery.granularity,
      balances,
      pending,
      officialRate,
    })

    return <CashflowReport view={view} />
  }

  const range = effectivePnlRange(reportQuery.filters.from, reportQuery.filters.to, today)
  // El informe muestra como mucho MAX_REPORT_MONTHS meses (los últimos del
  // rango) más el anterior para la variación: no tiene sentido traer cuotas
  // de antes, que `buildPnlReport` descartaría.
  const firstMonth = monthsInRange(range.from, range.to)[0] ?? monthKey(range.from)
  const prevMonthStart = `${monthKey(addMonthsClamped(`${firstMonth}-01`, -1))}-01`

  const [categories, paid] = await Promise.all([
    listCategories(user.id, undefined, true),
    listPaidInstallmentsForReport(user.id, {
      from: prevMonthStart,
      to: range.to,
      categoryIds:
        reportQuery.filters.categoryIds.length > 0
          ? reportQuery.filters.categoryIds
          : undefined,
      cardId:
        reportQuery.filters.cardId !== "all" ? reportQuery.filters.cardId : undefined,
      minCents: reportQuery.filters.minCents ?? undefined,
      maxCents: reportQuery.filters.maxCents ?? undefined,
      search: reportQuery.filters.search || undefined,
    }),
  ])

  const view = buildPnlReport({
    from: range.from,
    to: range.to,
    categories,
    paidInstallments: paid,
  })

  return (
    <PnlReport
      view={view}
      initialCurrency={reportQuery.currency}
      filters={reportQuery.filters}
      hasActiveFilters={hayFiltrosActivos(reportQuery.filters)}
    />
  )
}

function InformeSkeleton({ isFlow }: { isFlow: boolean }) {
  return (
    <div className="space-y-6" aria-hidden>
      <div className={isFlow ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
        {(isFlow ? [0, 1, 2] : [0, 1, 2, 3]).map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-[310px] animate-pulse rounded-xl bg-white/[0.03]" />
      <div className="h-[280px] animate-pulse rounded-xl bg-white/[0.03]" />
    </div>
  )
}

export default async function InformesPage({ searchParams }: Props) {
  const raw = await searchParams
  const reportQuery = parseReportQuery(raw)
  const today = todayInAr()
  const isFlow = reportQuery.tab === "flujo"

  return (
    <div className="space-y-6">
      <ReportControls query={reportQuery} />

      {!(isFlow && reportQuery.granularity === "semanal") ? (
        <Suspense
          fallback={
            <MovementFiltersSkeleton
              showPaymentMethod={!isFlow}
              showSort={false}
              showCurrency={false}
              showSearch={!isFlow}
              showCategory={!isFlow}
              showAmount={!isFlow}
              showPeriod
            />
          }
        >
          <BarraDeFiltros reportQuery={reportQuery} today={today} />
        </Suspense>
      ) : (
        <BarraDeFiltros reportQuery={reportQuery} today={today} />
      )}

      <Suspense fallback={<InformeSkeleton isFlow={isFlow} />}>
        <InformeBody reportQuery={reportQuery} today={today} />
      </Suspense>
    </div>
  )
}
