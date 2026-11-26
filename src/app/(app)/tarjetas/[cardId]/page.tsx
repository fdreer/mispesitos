import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"
import { z } from "zod"

import { CardArchiveButton } from "@/components/cards/card-archive-button"
import { CardDialog } from "@/components/cards/card-dialog"
import {
  PayStatementButton,
  StatementDatesButton,
  UnpayStatementButton,
  type StatementForActions,
} from "@/components/cards/statement-actions"
import { StatementStatus } from "@/components/cards/statement-status"
import { CategoryBadge } from "@/components/category-badge"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  addPeriods,
  cardColor,
  cardOverview,
  formatPeriod,
  isValidPeriod,
  proposeStatementDates,
  type StatementSummary,
} from "@/lib/cards"
import { categoryLabels } from "@/lib/category-tree"
import { formatIsoForDisplay, todayInAr } from "@/lib/dates"
import { convertToArs, formatMoney } from "@/lib/money"
import { assertCurrency } from "@/lib/movement-asserts"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { cn } from "@/lib/utils"
import { getCard, listStatementInstallments, listStatementSummaries } from "@/server/card-queries"
import { listCategories } from "@/server/queries"
import { requireSettings } from "@/server/session"

type Props = {
  params: Promise<{ cardId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * El detalle de una tarjeta y de UNO de sus resúmenes (§1.4 del plan v2): la
 * lista de cuotas que lo componen, los totales por moneda, "Pagar resumen" y
 * la corrección del cierre y el vencimiento.
 *
 * El resumen que se mira va en la URL (`?periodo=2026-11`), como los filtros
 * de /egresos: se puede compartir, recargar y volver atrás. Sin período, el
 * último que cerró si todavía no se pagó —es el que hay que pagar—, y si no,
 * el que está acumulando.
 *
 * Cualquier período válido se puede abrir, aunque el resumen no exista
 * todavía en la base: se muestra con sus fechas propuestas y en cero, y
 * corregirle las fechas lo crea. Es la forma de ajustar el cierre de un
 * resumen antes de que llegue la primera compra.
 */
export default async function TarjetaPage({ params, searchParams }: Props) {
  const { cardId } = await params
  if (!z.uuid().safeParse(cardId).success) notFound()

  const { user, settings } = await requireSettings()
  const today = todayInAr()
  const card = await getCard(user.id, cardId)
  if (!card) notFound()

  const [statements, categories] = await Promise.all([
    listStatementSummaries(user.id, card.id),
    listCategories(user.id, "expense", true),
  ])
  const { open, current } = cardOverview(card, statements, today)

  const rawPeriod = (await searchParams).periodo
  const requested = typeof rawPeriod === "string" && isValidPeriod(rawPeriod) ? rawPeriod : null
  const period =
    requested ?? (current && current.paidDate === null && current.totals.count > 0 ? current.period : open.period)

  const statement: StatementSummary & { usdPaidRate?: string | null } =
    statements.find((s) => s.period === period) ?? {
      ...proposeStatementDates(card, period),
      id: null,
      paidDate: null,
      totals: { arsCents: 0, usdCents: 0, count: 0 },
    }

  const [installments, rate] = await Promise.all([
    statement.id ? listStatementInstallments(user.id, statement.id) : Promise.resolve([]),
    // La cotización sólo hace falta para precargar el TC del pago en pesos.
    // dolarapi puede tardar: no se la pide si no hay dólares que pagar.
    statement.totals.usdCents > 0 && statement.paidDate === null
      ? fetchSuggestedRate(settings.preferredRate as RatePreference)
      : Promise.resolve(null),
  ])
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

  // Los períodos con resumen, más el que se mira y el que acumula, para la
  // fila de accesos directos.
  const periods = [...new Set([...statements.map((s) => s.period), open.period, period])].sort()
  const usdPaidRate = statement.usdPaidRate ? Number(statement.usdPaidRate) : null

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/tarjetas"
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Tarjetas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-paper">
            <span
              aria-hidden
              className="inline-block size-3 rounded-full"
              style={{ backgroundColor: cardColor(card) }}
            />
            {card.name}
            {card.archived && <Badge variant="outline">Archivada</Badge>}
          </h1>
          <div className="flex items-center gap-1">
            <CardDialog card={card} />
            <CardArchiveButton id={card.id} name={card.name} archived={card.archived} />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Cierra el {card.closingDay} y vence el {card.dueDay} de cada mes
          {card.creditLimitCents !== null &&
            ` · límite ${formatMoney(card.creditLimitCents, "ARS", 0)}`}
        </p>
      </div>

      <nav aria-label="Resúmenes" className="flex items-center gap-2">
        <Link
          href={`/tarjetas/${card.id}?periodo=${addPeriods(period, -1)}`}
          aria-label="Resumen anterior"
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronLeft />
        </Link>
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1">
          {periods.map((p) => (
            <li key={p} className="shrink-0">
              <Link
                href={`/tarjetas/${card.id}?periodo=${p}`}
                aria-current={p === period ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-xs",
                  p === period
                    ? "border-foreground bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {formatPeriod(p)}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={`/tarjetas/${card.id}?periodo=${addPeriods(period, 1)}`}
          aria-label="Resumen siguiente"
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronRight />
        </Link>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen de {formatPeriod(statement.period)}</CardTitle>
          <p className="text-sm">
            <StatementStatus statement={statement} today={today} />
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground text-xs">Cierre</dt>
              <dd className="tabular-nums">{formatIsoForDisplay(statement.closingDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Vencimiento</dt>
              <dd className="tabular-nums">{formatIsoForDisplay(statement.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">En pesos</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(statement.totals.arsCents, "ARS")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">En dólares</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(statement.totals.usdCents, "USD")}
              </dd>
            </div>
          </dl>

          {usdPaidRate !== null && (
            <p className="text-muted-foreground text-xs">
              Los dólares se pagaron con pesos a {formatMoney(Math.round(usdPaidRate * 100), "ARS")}:{" "}
              {formatMoney(convertToArs(statement.totals.usdCents, usdPaidRate), "ARS")}.
            </p>
          )}

          <div className="flex flex-wrap items-start gap-2">
            {statement.paidDate ? (
              <UnpayStatementButton statement={forActions} />
            ) : (
              <PayStatementButton
                statement={forActions}
                today={today}
                suggestedRate={rate?.referenceRate ?? null}
              />
            )}
            <StatementDatesButton statement={forActions} />
          </div>

          {installments.length === 0 ? (
            <p className="text-muted-foreground border-t pt-4 text-sm">
              No hay compras en este resumen.
            </p>
          ) : (
            <ul className="divide-y border-t">
              {installments.map((i) => {
                const label = i.categoryId ? labels.get(i.categoryId) : undefined
                return (
                  <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">
                        {i.description}
                        {i.total > 1 && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · cuota {i.number}/{i.total}
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                        Compra del {formatIsoForDisplay(i.date)}
                        {label && <CategoryBadge {...label} />}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatMoney(i.amountCents, assertCurrency(i.currency))}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
