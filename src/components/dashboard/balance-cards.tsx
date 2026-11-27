import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { shortDate } from "@/components/cards/statement-status"
import { InfoHint } from "@/components/info-hint"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPeriod } from "@/lib/cards"
import type { CommittedFunds, NextCardDue } from "@/lib/dashboard-view"
import { diffDaysIso, formatRelativeDue, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { formatOfficialRateLabel, type OfficialRateSnapshot } from "@/lib/rate"
import { cn, pluralize } from "@/lib/utils"

export function BalanceHeader({ title, hint }: { title: string; hint?: React.ReactNode }) {
  return (
    <CardHeader className="pb-1">
      <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {title}
        {hint && <InfoHint label={`Qué significa: ${title}`}>{hint}</InfoHint>}
      </CardTitle>
    </CardHeader>
  )
}

/**
 * El número, con el mismo tamaño y la misma alineación en todas las cards. Es
 * lo único que se viene a mirar acá, así que es lo único que se lee de lejos.
 */
export function BalanceAmount({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <p className={cn("text-xl tabular-nums whitespace-nowrap", className)}>{children}</p>
}

/** La línea de contexto: un solo renglón, siempre debajo del número. */
export function BalanceNote({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <p className={cn("text-muted-foreground text-xs", className)}>{children}</p>
}

type Props = {
  today: IsoDate
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  officialRate: OfficialRateSnapshot | null
  committed: CommittedFunds
  nextCardDue: NextCardDue | null
  paymentsThisMonth: { arsCents: number; usdCents: number; count: number; overdueCount: number }
}

/**
 * Las cuatro cifras que se vienen a mirar al abrir la app, en orden de
 * importancia: cuánta plata hay hoy, cuánta ya tiene destino, cuándo vence la
 * próxima tarjeta y qué falta pagar este mes.
 */
export function KeyFigures({
  today,
  arsCents,
  usdCents,
  consolidatedArsCents,
  officialRate,
  committed,
  nextCardDue,
  paymentsThisMonth,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card
        size="sm"
        className="col-span-2 gap-2 py-3 sm:col-span-1 ring-1 ring-signal-teal/25 bg-gradient-to-br from-signal-teal/[0.07] to-transparent"
      >
        <BalanceHeader
          title="Disponible hoy"
          hint="Saldo en pesos más saldo en dólares valuado al oficial comprador, igual que el punto de partida del flujo de fondos."
        />
        <CardContent className="space-y-0.5">
          <BalanceAmount className="text-2xl text-paper">
            {consolidatedArsCents === null
              ? formatMoney(arsCents, "ARS", 0)
              : formatMoney(consolidatedArsCents, "ARS", 0)}
          </BalanceAmount>
          {usdCents !== 0 && (
            <BalanceNote className="tabular-nums">
              {formatMoney(arsCents, "ARS", 0)} en pesos · {formatMoney(usdCents, "USD", 0)}
            </BalanceNote>
          )}
          <BalanceNote>
            {officialRate
              ? `Dólar ${formatOfficialRateLabel(officialRate.fetchedAt)} · ${Math.round(officialRate.compra).toLocaleString("es-AR")}`
              : "Sin cotización oficial: los dólares van aparte"}
          </BalanceNote>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader
          title={committed.untilLabel ? `Comprometido hasta ${committed.untilLabel}` : "Comprometido"}
          hint="Todos los egresos pendientes desde hoy hasta el final del horizonte (cuotas, resúmenes de tarjeta y gastos fijos), más lo que ya está vencido. Los dólares se valúan al oficial vendedor."
        />
        <CardContent className="space-y-0.5">
          <BalanceAmount>{formatMoney(committed.totalCents, "ARS", 0)}</BalanceAmount>
          {committed.unconvertedUsdCents > 0 && (
            <BalanceNote>+ {formatMoney(committed.unconvertedUsdCents, "USD", 0)} sin convertir</BalanceNote>
          )}
          {committed.overdueCents > 0 && (
            <BalanceNote className="text-coral-red tabular-nums">
              Incluye {formatMoney(committed.overdueCents, "ARS", 0)} vencido
            </BalanceNote>
          )}
          <BalanceNote className="tabular-nums">
            Entran {formatMoney(committed.incomingCents, "ARS", 0)} en el mismo período
          </BalanceNote>
        </CardContent>
      </Card>

      <NextCardDueCard item={nextCardDue} today={today} />

      <Card size="sm" className="col-span-2 gap-2 py-3 sm:col-span-1">
        <BalanceHeader
          title="A pagar este mes"
          hint="Egresos pendientes que vencen este mes, más los vencidos de meses anteriores, separados por moneda."
        />
        <CardContent className="space-y-0.5">
          <BalanceAmount>{formatMoney(paymentsThisMonth.arsCents, "ARS", 0)}</BalanceAmount>
          {paymentsThisMonth.usdCents > 0 && (
            <BalanceNote>+ {formatMoney(paymentsThisMonth.usdCents, "USD", 0)}</BalanceNote>
          )}
          <BalanceNote>
            {paymentsThisMonth.count === 0 ? (
              "Estás al día"
            ) : (
              <>
                {pluralize(paymentsThisMonth.count, "concepto", "conceptos")}
                {paymentsThisMonth.overdueCount > 0 && (
                  <span className="text-coral-red">
                    {" "}
                    · {pluralize(paymentsThisMonth.overdueCount, "vencido", "vencidos")}
                  </span>
                )}
              </>
            )}
          </BalanceNote>
        </CardContent>
      </Card>
    </div>
  )
}

function NextCardDueCard({ item, today }: { item: NextCardDue | null; today: IsoDate }) {
  if (item === null) {
    return (
      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader title="Próxima tarjeta a pagar" />
        <CardContent className="space-y-0.5">
          <BalanceAmount className="text-muted-foreground">—</BalanceAmount>
          <BalanceNote>No hay resúmenes por pagar</BalanceNote>
        </CardContent>
      </Card>
    )
  }

  const days = diffDaysIso(item.dueDate, today)
  const urgent = days <= 3
  const onlyUsd = item.arsCents === 0 && item.usdCents > 0

  return (
    <Card
      size="sm"
      className="group relative gap-2 py-3 transition-colors hover:bg-white/[0.015] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring"
    >
      <BalanceHeader title="Próxima tarjeta a pagar" />
      <CardContent className="space-y-0.5">
        <BalanceAmount>
          {onlyUsd ? formatMoney(item.usdCents, "USD") : formatMoney(item.arsCents, "ARS", 0)}
        </BalanceAmount>
        {!onlyUsd && item.usdCents > 0 && (
          <BalanceNote className="tabular-nums">
            + {formatMoney(item.usdCents, "USD")}
            {item.usdInArsCents !== null && ` ≈ ${formatMoney(item.usdInArsCents, "ARS", 0)}`}
          </BalanceNote>
        )}
        <BalanceNote>
          <span className={cn(urgent && "font-medium text-coral-red")}>
            {capitalize(formatRelativeDue(item.dueDate, today, shortDate(item.dueDate)))}
          </span>
          {" · "}
          <Link
            href={`/tarjetas/${item.cardId}?periodo=${item.period}`}
            className="text-foreground outline-none after:absolute after:inset-0"
          >
            {item.cardName} · {formatPeriod(item.period)}
          </Link>
        </BalanceNote>
        {item.laterCount > 0 && (
          <BalanceNote>
            {pluralize(item.laterCount, "resumen más", "resúmenes más")} después
          </BalanceNote>
        )}
      </CardContent>
      <ChevronRight
        className="text-muted-foreground absolute top-3 right-3 size-4 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </Card>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
