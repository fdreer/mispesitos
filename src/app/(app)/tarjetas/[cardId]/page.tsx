import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ChevronLeft, ChevronRight, Info } from "lucide-react"
import { z } from "zod"

import { CardArchiveButton } from "@/components/cards/card-archive-button"
import { CardDialog } from "@/components/cards/card-dialog"
import {
  PayStatementButton,
  StatementDatesButton,
  UnpayStatementButton,
  type StatementForActions,
} from "@/components/cards/statement-actions"
import { CardSwatch, CreditUsage, MoneyStack, StatLabel } from "@/components/cards/card-ui"
import {
  relativeDay,
  StatementBadge,
  statementState,
  type StatementState,
} from "@/components/cards/statement-status"
import { CategoryBadge } from "@/components/category-badge"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { computeBalances } from "@/lib/balance"
import {
  addPeriods,
  availableCredit,
  cardColor,
  cardOverview,
  effectiveStatementRate,
  formatPeriod,
  isValidPeriod,
  proposeStatementDates,
  type StatementSummary,
} from "@/lib/cards"
import { categoryLabels } from "@/lib/category-tree"
import { formatIsoForDisplay, todayInAr } from "@/lib/dates"
import { convertToArs, formatMoney } from "@/lib/money"
import {
  assertCurrency,
  assertExchangeDirection,
  assertInstallmentMovementKind,
} from "@/lib/movement-asserts"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { cn } from "@/lib/utils"
import {
  getCard,
  listStatementInstallments,
  listStatementSummaries,
  listUnpaidCardInstallments,
} from "@/server/card-queries"
import {
  listCategories,
  listExchanges,
  listPaidInstallments,
} from "@/server/queries"
import { resolveOfficialRate } from "@/server/rate"
import { requireSettings } from "@/server/session"

type Props = {
  params: Promise<{ cardId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TarjetaPage({ params, searchParams }: Props) {
  const { cardId } = await params
  if (!z.uuid().safeParse(cardId).success) notFound()

  const { user, settings } = await requireSettings()
  const today = todayInAr()
  const card = await getCard(user.id, cardId)
  if (!card) notFound()

  const [statements, categories, officialRate, unpaid] = await Promise.all([
    listStatementSummaries(user.id, card.id),
    listCategories(user.id, "expense", true),
    resolveOfficialRate(user.id, settings),
    card.creditLimitCents !== null ? listUnpaidCardInstallments(user.id) : Promise.resolve([]),
  ])
  const { open, current } = cardOverview(card, statements, today)

  const rawPeriod = (await searchParams).periodo
  const requested = typeof rawPeriod === "string" && isValidPeriod(rawPeriod) ? rawPeriod : null
  const period =
    requested ?? (current && current.paidDate === null && current.totals.count > 0 ? current.period : open.period)

  const statement: StatementSummary & { usdPaidArsCents?: number | null } =
    statements.find((s) => s.period === period) ?? {
      ...proposeStatementDates(card, period),
      id: null,
      paidDate: null,
      totals: { arsCents: 0, usdCents: 0, count: 0 },
    }

  const needsUsdPaymentInfo = statement.totals.usdCents > 0 && statement.paidDate === null
  const [installments, suggestedRate, paidInstallments, exchanges] = await Promise.all([
    statement.id ? listStatementInstallments(user.id, statement.id) : Promise.resolve([]),
    needsUsdPaymentInfo
      ? fetchSuggestedRate(settings.preferredRate as RatePreference)
      : Promise.resolve(null),
    needsUsdPaymentInfo ? listPaidInstallments(user.id) : Promise.resolve([]),
    needsUsdPaymentInfo ? listExchanges(user.id) : Promise.resolve([]),
  ])

  const usdBalanceCents = needsUsdPaymentInfo
    ? computeBalances(
        {
          initialArsCents: settings.initialBalanceArsCents,
          initialUsdCents: settings.initialBalanceUsdCents,
          initialDate: settings.initialBalanceDate,
        },
        paidInstallments.map((p) => ({
          paidDate: p.paidDate,
          currency: assertCurrency(p.currency),
          kind: assertInstallmentMovementKind(p.kind),
          amountCents: p.amountCents,
        })),
        exchanges.map((e) => ({
          date: e.date,
          direction: assertExchangeDirection(e.direction),
          usdCents: e.amountCents,
          rate: Number(e.rate),
        })),
      ).usdCents
    : 0

  const labels = categoryLabels(categories)

  const forActions: StatementForActions = {
    id: statement.id,
    cardId: card.id,
    cardName: card.name,
    period: statement.period,
    closingDate: statement.closingDate,
    dueDate: statement.dueDate,
    paidDate: statement.paidDate,
    arsCents: statement.totals.arsCents,
    usdCents: statement.totals.usdCents,
    count: statement.totals.count,
  }

  const periods = [...new Set([...statements.map((s) => s.period), open.period, period])].sort()
  const usdPaidArsCents = statement.usdPaidArsCents ?? null
  const effRate =
    usdPaidArsCents !== null
      ? effectiveStatementRate(usdPaidArsCents, statement.totals.usdCents)
      : null
  const officialSellRate = officialRate?.venta ?? null

  const color = cardColor(card)
  const available = availableCredit(
    card.creditLimitCents,
    unpaid.filter((i) => i.cardId === card.id),
    officialSellRate,
  )
  const stateByPeriod = new Map<string, StatementState>(
    statements.map((s) => [s.period, statementState(s, today)]),
  )
  const isOpen = statement.closingDate >= today
  const state = statementState(statement, today)
  const showUsdNote =
    usdPaidArsCents !== null ||
    (statement.paidDate === null && statement.totals.usdCents > 0 && officialSellRate !== null)

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/tarjetas"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Tarjetas
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-paper">
              <CardSwatch color={color} className="h-4 w-6" />
              {card.name}
              {card.archived && <Badge variant="secondary">Archivada</Badge>}
            </h1>
            <p className="text-muted-foreground text-sm">
              Cierra el {card.closingDay} y vence el {card.dueDay} de cada mes
            </p>
          </div>
          <div className="flex items-center gap-1">
            <CardDialog card={card} />
            <CardArchiveButton id={card.id} name={card.name} archived={card.archived} />
          </div>
        </div>
        {available !== null && card.creditLimitCents !== null && (
          <div className="max-w-md">
            <CreditUsage
              limitCents={card.creditLimitCents}
              availableCents={available.arsCents}
              unconvertedUsdCents={available.unconvertedUsdCents}
              color={color}
            />
          </div>
        )}
      </div>

      <nav aria-label="Resúmenes" className="flex items-center gap-1">
        <Link
          href={`/tarjetas/${card.id}?periodo=${addPeriods(period, -1)}`}
          aria-label="Resumen anterior"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ChevronLeft />
        </Link>
        <ul className="flex min-w-0 gap-0.5 overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5 [scrollbar-width:none]">
          {periods.map((p) => {
            const pState = stateByPeriod.get(p)
            const active = p === period
            return (
              <li key={p} className="shrink-0">
                <Link
                  href={`/tarjetas/${card.id}?periodo=${p}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-white/[0.08] text-paper shadow-sm"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  {pState && STATE_DOT[pState] && (
                    <span aria-hidden className={cn("size-1.5 rounded-full", STATE_DOT[pState])} />
                  )}
                  {formatPeriod(p)}
                  {pState && STATE_LABEL[pState] && (
                    <span className="sr-only"> ({STATE_LABEL[pState]})</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
        <Link
          href={`/tarjetas/${card.id}?periodo=${addPeriods(period, 1)}`}
          aria-label="Resumen siguiente"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ChevronRight />
        </Link>
      </nav>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-medium text-paper">
              Resumen de {formatPeriod(statement.period)}
            </h2>
            <StatementBadge statement={statement} today={today} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatementDatesButton statement={forActions} />
            {statement.paidDate ? (
              <UnpayStatementButton statement={forActions} />
            ) : (
              <PayStatementButton
                statement={forActions}
                today={today}
                officialSellRate={officialSellRate}
                suggestedBuyRate={suggestedRate?.buyRate ?? null}
                usdBalanceCents={usdBalanceCents}
              />
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <dt>
              <StatLabel>{isOpen ? "Acumulado hasta hoy" : "Total del resumen"}</StatLabel>
            </dt>
            <dd>
              <MoneyStack
                arsCents={statement.totals.arsCents}
                usdCents={statement.totals.usdCents}
                size="xl"
              />
            </dd>
          </div>
          <div className="space-y-1">
            <dt>
              <StatLabel>Cierre</StatLabel>
            </dt>
            <dd className="text-sm text-paper tabular-nums">
              {formatIsoForDisplay(statement.closingDate)}
            </dd>
            <dd className="text-muted-foreground text-xs">
              {isOpen ? "cierra" : "cerró"} {relativeDay(statement.closingDate, today)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt>
              <StatLabel>Vencimiento</StatLabel>
            </dt>
            <dd className="text-sm text-paper tabular-nums">
              {formatIsoForDisplay(statement.dueDate)}
            </dd>
            <dd
              className={cn(
                "text-xs",
                state === "overdue" ? "text-coral-red" : "text-muted-foreground",
              )}
            >
              {statement.dueDate >= today ? "vence" : "venció"}{" "}
              {relativeDay(statement.dueDate, today)}
            </dd>
          </div>
        </dl>

        {showUsdNote && (
          <div className="text-muted-foreground mx-5 mb-5 flex gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5 text-xs tabular-nums">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            {usdPaidArsCents !== null ? (
              <p>
                Los {formatMoney(statement.totals.usdCents, "USD")} se pagaron con{" "}
                <span className="text-foreground">{formatMoney(usdPaidArsCents, "ARS")}</span>
                {effRate !== null &&
                  ` (TC efectivo ${formatMoney(Math.round(effRate * 100), "ARS")})`}
                .
              </p>
            ) : (
              <p>
                Si pagás los {formatMoney(statement.totals.usdCents, "USD")} en pesos serían{" "}
                <span className="text-foreground">
                  ≈ {formatMoney(convertToArs(statement.totals.usdCents, officialSellRate ?? 0), "ARS")}
                </span>{" "}
                al oficial vendedor de hoy.
              </p>
            )}
          </div>
        )}

        <div className="border-t border-white/[0.05]">
          <div className="text-muted-foreground flex items-center justify-between px-5 pt-4 pb-2 text-xs">
            <span>Compras · {installments.length}</span>
            {installments.length > 0 && <span>Importe</span>}
          </div>
          {installments.length === 0 ? (
            <p className="text-muted-foreground px-5 pt-2 pb-6 text-sm">
              {isOpen ? "Todavía no hay compras en este resumen." : "No hubo compras en este resumen."}
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.05] pb-1">
              {installments.map((i) => {
                const label = i.categoryId ? labels.get(i.categoryId) : undefined
                return (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-white/[0.015]"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="truncate text-paper">{i.description}</span>
                        {i.total > 1 && (
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            Cuota {i.number}/{i.total}
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs tabular-nums">
                        {formatIsoForDisplay(i.date)}
                        {label && <CategoryBadge {...label} />}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-paper tabular-nums">
                      {formatMoney(i.amountCents, assertCurrency(i.currency))}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}

const STATE_DOT: Partial<Record<StatementState, string>> = {
  overdue: "bg-coral-red",
  due: "bg-ember-orange",
  paid: "bg-pulse-green",
}

const STATE_LABEL: Partial<Record<StatementState, string>> = {
  overdue: "vencido",
  due: "a pagar",
  paid: "pagado",
}
