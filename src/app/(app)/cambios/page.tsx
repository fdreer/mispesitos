import { Suspense } from "react"

import { DeleteMovementButton } from "@/components/delete-movement-button"
import { ExchangeForm } from "@/components/exchange-form"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatIsoForDisplay, todayInAr } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listExchanges, type Movement } from "@/server/queries"
import { requireSettings } from "@/server/session"

function FilaDeCambio({ exchange }: { exchange: Movement }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2">
        <Badge variant={exchange.direction === "buy" ? "success" : "warning"}>
          {exchange.direction === "buy" ? "Compra" : "Venta"}
        </Badge>
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatIsoForDisplay(exchange.date)} · a {Number(exchange.rate).toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{formatMoney(exchange.amountCents, "USD")}</span>
        <DeleteMovementButton id={exchange.id} description={exchange.description} />
      </div>
    </li>
  )
}

async function CambiosBody() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [todosLosCambios, rate] = await Promise.all([
    listExchanges(user.id),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const exchanges = todosLosCambios.filter((e) => e.date >= settings.initialBalanceDate)
  const anteriores = todosLosCambios.filter((e) => e.date < settings.initialBalanceDate)

  return (
    <>
      <ExchangeForm buyRate={rate?.buyRate ?? null} sellRate={rate?.sellRate ?? null} today={today} />

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base">Operaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {exchanges.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no registraste ninguna compra ni venta.
            </p>
          ) : (
            <ul className="divide-y">
              {exchanges.map((e) => (
                <FilaDeCambio key={e.id} exchange={e} />
              ))}
            </ul>
          )}

          {anteriores.length > 0 && (
            <div className="mt-6 space-y-2 border-t pt-4">
              <p className="text-muted-foreground text-sm">
                {anteriores.length === 1
                  ? "Hay 1 operación anterior"
                  : `Hay ${anteriores.length} operaciones anteriores`}{" "}
                al {formatIsoForDisplay(settings.initialBalanceDate)}, la fecha de tu saldo
                inicial. No afectan tu saldo actual. Si la fecha quedó mal tipeada, borralas y
                cargalas de nuevo.
              </p>
              <ul className="divide-y opacity-60">
                {anteriores.map((e) => (
                  <FilaDeCambio key={e.id} exchange={e} />
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function CambiosSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-[180px] animate-pulse rounded-lg bg-white/[0.03]" />
      <div className="h-[140px] animate-pulse rounded-lg bg-white/[0.03]" />
    </div>
  )
}

export default function CambiosPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<CambiosSkeleton />}>
        <CambiosBody />
      </Suspense>
    </div>
  )
}
