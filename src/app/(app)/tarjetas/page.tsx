import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight, CreditCard as CreditCardIcon } from "lucide-react"

import { CardArchiveButton } from "@/components/cards/card-archive-button"
import { CardDialog } from "@/components/cards/card-dialog"
import { CardSwatch, CreditUsage, MoneyStack, StatLabel } from "@/components/cards/card-ui"
import {
  shortDate,
  StatementBadge,
  statementState,
} from "@/components/cards/statement-status"
import { BalanceAmount, BalanceHeader, BalanceNote } from "@/components/dashboard/balance-cards"
import { Card, CardContent } from "@/components/ui/card"
import {
  availableCredit,
  cardColor,
  cardOverview,
  effectiveStatementRate,
  formatPeriod,
  type AvailableCredit,
  type StatementSummary,
} from "@/lib/cards"
import { formatIsoForDisplay, formatRelativeDue, todayInAr, type IsoDate } from "@/lib/dates"
import { convertToArs, formatMoney } from "@/lib/money"
import { type CreditCard, type StatementRow } from "@/server/card-queries"
import { getCardsOverviewData } from "@/server/page-data"
import { resolveOfficialRate } from "@/server/rate"
import { requireSettings } from "@/server/session"

type CardStatementSummary = StatementSummary & { usdPaidArsCents?: number | null }

type CardView = {
  card: CreditCard
  color: string
  open: CardStatementSummary
  current: CardStatementSummary | null
  available: AvailableCredit | null
}

function pluralize(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** La línea fina debajo de un resumen con dólares: cuánto sería en pesos, o cuánto se pagó. */
function UsdNote({
  summary,
  officialSellRate,
}: {
  summary: CardStatementSummary
  officialSellRate: number | null
}) {
  const { usdCents } = summary.totals
  if (usdCents === 0) return null
  if (summary.paidDate === null) {
    if (officialSellRate === null) return null
    return (
      <p className="text-muted-foreground text-xs tabular-nums">
        ≈ {formatMoney(convertToArs(usdCents, officialSellRate), "ARS", 0)} si pagás los dólares en
        pesos
      </p>
    )
  }
  if (summary.usdPaidArsCents == null) return null
  const rate = effectiveStatementRate(summary.usdPaidArsCents, usdCents)
  return (
    <p className="text-muted-foreground text-xs tabular-nums">
      Dólares pagados con {formatMoney(summary.usdPaidArsCents, "ARS", 0)}
      {rate !== null && ` · TC ${formatMoney(Math.round(rate * 100), "ARS")}`}
    </p>
  )
}

function CardTile({
  view,
  officialSellRate,
  today,
}: {
  view: CardView
  officialSellRate: number | null
  today: IsoDate
}) {
  const { card, color, open, current, available } = view

  return (
    <Card
      size="sm"
      className="relative gap-0 py-0 transition-colors hover:bg-white/[0.015] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <CardSwatch color={color} />
          <div className="min-w-0">
            <Link
              href={`/tarjetas/${card.id}`}
              className="block truncate text-sm font-medium text-paper outline-none after:absolute after:inset-0"
            >
              {card.name}
            </Link>
            <p className="text-muted-foreground text-xs">
              Cierra el {card.closingDay} · vence el {card.dueDay}
            </p>
          </div>
        </div>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </div>

      <div className="grid grid-cols-2 gap-4 px-4 py-4">
        <div className="min-w-0 space-y-1.5">
          <StatLabel>{current ? `A pagar · ${formatPeriod(current.period)}` : "A pagar"}</StatLabel>
          {current && current.totals.count > 0 ? (
            <>
              <MoneyStack
                arsCents={current.totals.arsCents}
                usdCents={current.totals.usdCents}
                muted={current.paidDate !== null}
              />
              <StatementBadge statement={current} today={today} />
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-lg">—</p>
              <p className="text-muted-foreground text-xs">
                {current ? "Sin compras" : "Aún no cerró ninguno"}
              </p>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <StatLabel>En curso · {formatPeriod(open.period)}</StatLabel>
          <MoneyStack
            arsCents={open.totals.arsCents}
            usdCents={open.totals.usdCents}
            muted={open.totals.count === 0}
          />
          <p className="text-muted-foreground text-xs">
            {open.totals.count > 0 ? `${pluralize(open.totals.count, "compra", "compras")} · ` : ""}
            cierra {shortDate(open.closingDate)}
          </p>
        </div>
      </div>

      {current && current.totals.count > 0 && (
        <div className="-mt-2 px-4 pb-4 empty:hidden">
          <UsdNote summary={current} officialSellRate={officialSellRate} />
        </div>
      )}

      {available !== null && card.creditLimitCents !== null && (
        <div className="border-t border-white/[0.05] px-4 py-3">
          <CreditUsage
            limitCents={card.creditLimitCents}
            availableCents={available.arsCents}
            unconvertedUsdCents={available.unconvertedUsdCents}
            color={color}
          />
        </div>
      )}
    </Card>
  )
}

/**
 * Las tres cifras que se vienen a mirar: lo que hay que pagar de resúmenes
 * cerrados, el próximo vencimiento y lo que se viene acumulando.
 */
function Overview({ views, today }: { views: CardView[]; today: IsoDate }) {
  const toPay = views
    .map((v) => ({ v, s: v.current }))
    .filter(
      (x): x is { v: CardView; s: CardStatementSummary } =>
        x.s !== null && ["due", "overdue"].includes(statementState(x.s, today)),
    )
  const toPayArs = toPay.reduce((acc, x) => acc + x.s.totals.arsCents, 0)
  const toPayUsd = toPay.reduce((acc, x) => acc + x.s.totals.usdCents, 0)
  const overdue = toPay.filter((x) => statementState(x.s, today) === "overdue").length
  const next = [...toPay].sort((a, b) => (a.s.dueDate < b.s.dueDate ? -1 : 1))[0]

  const openArs = views.reduce((acc, v) => acc + v.open.totals.arsCents, 0)
  const openUsd = views.reduce((acc, v) => acc + v.open.totals.usdCents, 0)
  const openCount = views.reduce((acc, v) => acc + v.open.totals.count, 0)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-4xl">
      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader
          title="A pagar"
          hint="Resúmenes que ya cerraron y todavía no pagaste, de todas las tarjetas activas."
        />
        <CardContent>
          <BalanceAmount>{formatMoney(toPayArs, "ARS", 0)}</BalanceAmount>
          {toPayUsd > 0 && <BalanceNote>+ {formatMoney(toPayUsd, "USD")}</BalanceNote>}
          <BalanceNote>
            {toPay.length === 0 ? (
              "Nada pendiente"
            ) : (
              <>
                {pluralize(toPay.length, "resumen", "resúmenes")}
                {overdue > 0 && (
                  <span className="text-coral-red"> · {pluralize(overdue, "vencido", "vencidos")}</span>
                )}
              </>
            )}
          </BalanceNote>
        </CardContent>
      </Card>

      <Card size="sm" className="order-last col-span-2 gap-2 py-3 sm:order-none sm:col-span-1">
        <BalanceHeader title="Próximo vencimiento" />
        <CardContent>
          {next ? (
            <>
              <BalanceAmount>{formatIsoForDisplay(next.s.dueDate)}</BalanceAmount>
              <BalanceNote>
                <span className={overdue > 0 ? "text-coral-red" : undefined}>
                  {formatRelativeDue(next.s.dueDate, today, shortDate(next.s.dueDate))}
                </span>{" "}
                · {next.v.card.name}
              </BalanceNote>
            </>
          ) : (
            <>
              <BalanceAmount>—</BalanceAmount>
              <BalanceNote>Sin resúmenes por pagar</BalanceNote>
            </>
          )}
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader
          title="En curso"
          hint="Lo que ya cargaste en los resúmenes abiertos. Se paga cuando cada uno cierre y venza."
        />
        <CardContent>
          <BalanceAmount>{formatMoney(openArs, "ARS", 0)}</BalanceAmount>
          {openUsd > 0 && <BalanceNote>+ {formatMoney(openUsd, "USD")}</BalanceNote>}
          <BalanceNote>{pluralize(openCount, "compra", "compras")}</BalanceNote>
        </CardContent>
      </Card>
    </div>
  )
}

async function TarjetasBody() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()
  const [{ cards, statements, unpaid }, officialRate] = await Promise.all([
    getCardsOverviewData(user.id),
    resolveOfficialRate(user.id, settings),
  ])

  const archived = cards.filter((c) => c.archived)
  const officialSellRate = officialRate?.venta ?? null

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white/[0.02] px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.04]">
          <CreditCardIcon className="text-muted-foreground size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-paper">Todavía no cargaste ninguna tarjeta</p>
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            Cada compra con tarjeta cae en su resumen y cuenta como gasto el día que pagás el
            resumen.
          </p>
        </div>
        <CardDialog />
      </div>
    )
  }

  const views: CardView[] = cards
    .filter((c) => !c.archived)
    .map((card) => {
      const own: StatementRow[] = statements.filter((s) => s.cardId === card.id)
      const { open, current } = cardOverview(card, own, today)
      return {
        card,
        color: cardColor(card),
        open: own.find((s) => s.period === open.period) ?? open,
        current: current ? (own.find((s) => s.period === current.period) ?? current) : null,
        available: availableCredit(
          card.creditLimitCents,
          unpaid.filter((i) => i.cardId === card.id),
          officialSellRate,
        ),
      }
    })

  return (
    <>
      {views.length > 0 && (
        <>
          <Overview views={views} today={today} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {views.map((view) => (
              <CardTile
                key={view.card.id}
                view={view}
                officialSellRate={officialSellRate}
                today={today}
              />
            ))}
          </div>
        </>
      )}

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-medium">
            Archivadas · {archived.length}
          </h2>
          <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-xl bg-white/[0.02]">
            {archived.map((card) => (
              <li key={card.id} className="flex items-center justify-between gap-2 py-1.5 pr-2 pl-4">
                <Link
                  href={`/tarjetas/${card.id}`}
                  className="text-muted-foreground flex min-w-0 items-center gap-2.5 text-sm hover:text-foreground"
                >
                  <CardSwatch color={cardColor(card)} className="opacity-50" />
                  <span className="truncate">{card.name}</span>
                </Link>
                <CardArchiveButton id={card.id} name={card.name} archived />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function TarjetasSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-4xl">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[100px] animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-[230px] animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
    </div>
  )
}

/** Sin `async`: el botón de alta sale en el primer flush. */
export default function TarjetasPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CardDialog />
      </div>
      <Suspense fallback={<TarjetasSkeleton />}>
        <TarjetasBody />
      </Suspense>
    </div>
  )
}
