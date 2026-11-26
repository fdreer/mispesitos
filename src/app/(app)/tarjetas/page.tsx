import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { CardArchiveButton } from "@/components/cards/card-archive-button"
import { CardDialog } from "@/components/cards/card-dialog"
import { StatementStatus } from "@/components/cards/statement-status"
import { Card, CardContent } from "@/components/ui/card"
import {
  availableCredit,
  cardColor,
  cardOverview,
  formatPeriod,
  type StatementSummary,
} from "@/lib/cards"
import { formatIsoForDisplay, todayInAr, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import {
  listCards,
  listStatementSummaries,
  listUnpaidCardInstallments,
  type CreditCard,
} from "@/server/card-queries"
import { requireSettings } from "@/server/session"

/** "$ 480.000 · US$ 120", o "Sin compras" si está en cero. */
function Totals({ summary }: { summary: StatementSummary }) {
  const { arsCents, usdCents, count } = summary.totals
  if (count === 0) return <span className="text-muted-foreground">Sin compras</span>
  return (
    <span className="tabular-nums">
      {[
        arsCents > 0 || usdCents === 0 ? formatMoney(arsCents, "ARS") : null,
        usdCents > 0 ? formatMoney(usdCents, "USD") : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
  )
}

/**
 * Una tarjeta visual por tarjeta de crédito (§1.4 del plan v2): el resumen
 * actual —el último que cerró, con su vencimiento y si se pagó—, el próximo
 * que está acumulando, y el disponible si hay límite. Toda la tarjeta es un
 * enlace al detalle, donde se paga y se corrigen fechas.
 */
function CardTile({
  card,
  statements,
  available,
  today,
}: {
  card: CreditCard
  statements: StatementSummary[]
  available: number | null
  today: IsoDate
}) {
  const { open, current } = cardOverview(card, statements, today)
  return (
    <Card size="sm" className="relative overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: cardColor(card) }}
      />
      <CardContent className="space-y-4 pt-2">
        <Link
          href={`/tarjetas/${card.id}`}
          className="flex items-center justify-between gap-2 text-base font-semibold text-paper after:absolute after:inset-0"
        >
          {card.name}
          <ChevronRight className="text-muted-foreground size-4" aria-hidden />
        </Link>

        {current ? (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">
              Resumen actual · {formatPeriod(current.period)}
            </p>
            <p className="text-lg font-semibold">
              <Totals summary={current} />
            </p>
            <p className="text-sm">
              <StatementStatus statement={current} today={today} />
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Todavía no cerró ningún resumen.</p>
        )}

        <div className="space-y-1 border-t pt-3">
          <p className="text-muted-foreground text-xs">
            Próximo · {formatPeriod(open.period)} · cierra el {formatIsoForDisplay(open.closingDate)}
          </p>
          <p className="text-sm">
            <Totals summary={open} />
          </p>
        </div>

        {available !== null && (
          <p className="text-muted-foreground border-t pt-3 text-xs">
            Disponible:{" "}
            <span className={available < 0 ? "text-destructive font-medium" : "text-foreground font-medium"}>
              {formatMoney(available, "ARS", 0)}
            </span>{" "}
            de {formatMoney(card.creditLimitCents ?? 0, "ARS", 0)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

async function TarjetasBody() {
  const { user } = await requireSettings()
  const today = todayInAr()
  const [cards, statements, unpaid] = await Promise.all([
    listCards(user.id, true),
    listStatementSummaries(user.id),
    listUnpaidCardInstallments(user.id),
  ])

  const active = cards.filter((c) => !c.archived)
  const archived = cards.filter((c) => c.archived)

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Todavía no cargaste ninguna tarjeta. Con una tarjeta, cada compra cae en su resumen y
          cuenta como gasto el día que pagás el resumen.
        </p>
      </div>
    )
  }

  return (
    <>
      {active.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              statements={statements.filter((s) => s.cardId === card.id)}
              available={availableCredit(
                card.creditLimitCents,
                unpaid.filter((i) => i.cardId === card.id),
              )}
              today={today}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium">Archivadas</h2>
          <ul className="divide-y rounded-xl border border-border">
            {archived.map((card) => (
              <li key={card.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <Link href={`/tarjetas/${card.id}`} className="text-sm underline-offset-4 hover:underline">
                  {card.name}
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="h-[236px] animate-pulse rounded-xl border border-border" />
      ))}
    </div>
  )
}

/** Sin `async`: el título y el botón de alta salen en el primer flush. */
export default function TarjetasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-paper">Tarjetas</h1>
        <CardDialog />
      </div>
      <Suspense fallback={<TarjetasSkeleton />}>
        <TarjetasBody />
      </Suspense>
    </div>
  )
}
