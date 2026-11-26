import { Suspense } from "react"

import { BalanceAmount, BalanceHeader } from "@/components/dashboard/balance-cards"
import { DeleteMovementButton } from "@/components/delete-movement-button"
import { ExchangeForm } from "@/components/exchange-form"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatIsoForDisplay, todayInAr } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { usdPosition } from "@/lib/position"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listExchanges, listUsdPositionEvents, type Movement } from "@/server/queries"
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

  const [todosLosCambios, events, rate] = await Promise.all([
    listExchanges(user.id),
    listUsdPositionEvents(user.id),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const exchanges = todosLosCambios.filter((e) => e.date >= settings.initialBalanceDate)
  const anteriores = todosLosCambios.filter((e) => e.date < settings.initialBalanceDate)

  const position = usdPosition(events)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <BalanceHeader
            title="Tenencia"
            hint="Cuánto tenés en dólares ahora. Nunca baja de cero: si en algún punto vendiste más de lo que tenías cargado, esa diferencia se guarda aparte como sobreventa (ver el aviso más abajo) en vez de dejar la tenencia en negativo."
          />
          <CardContent>
            <BalanceAmount>{formatMoney(position.usdCents, "USD")}</BalanceAmount>
          </CardContent>
        </Card>

        <Card size="sm">
          <BalanceHeader
            title="TC promedio"
            hint="El tipo de cambio promedio al que compraste los dólares que todavía forman parte de tu tenencia."
          />
          <CardContent>
            <BalanceAmount>
              {position.averageRate > 0 ? position.averageRate.toFixed(2) : "—"}
            </BalanceAmount>
          </CardContent>
        </Card>

        <Card size="sm">
          <BalanceHeader
            title="Diferencia de cambio"
            hint="Lo que ganaste o perdiste vendiendo dólares a un tipo de cambio distinto del promedio con el que los compraste. No es lo mismo que el saldo en pesos del dashboard."
          />
          <CardContent>
            <BalanceAmount>{formatMoney(position.realizedArsCents, "ARS")}</BalanceAmount>
          </CardContent>
        </Card>
      </div>

      {position.oversoldUsdCents > 0 && (
        <div className="space-y-1 text-sm">
          <p className="text-destructive">
            En algún punto de tu historial salieron más dólares de los que tenías cargados: en
            total, {formatMoney(position.oversoldUsdCents, "USD")}. Cargá la compra o el ingreso
            en dólares que te falte con la fecha real en que pasó (no con la de hoy): la posición
            se recalcula por fecha, así que el aviso se apaga cuando lo que falta queda cargado
            antes de la salida.
          </p>
          <p className="text-muted-foreground">
            Mientras tanto es normal que este número no coincida con el saldo en dólares del
            dashboard: acá la tenencia nunca baja de cero, ahí sí puede quedar negativa, y la
            diferencia entre los dos es exactamente esto.
          </p>
        </div>
      )}

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
                inicial. No cuentan en los números de arriba. Si la fecha quedó mal tipeada,
                borralas y cargalas de nuevo.
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

/** La misma grilla que arma `CambiosBody`, en gris. Ver `DashboardSkeleton`. */
function CambiosSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-xl border border-border" />
        ))}
      </div>
      <div className="h-[180px] animate-pulse rounded-lg border border-border" />
    </div>
  )
}

/** Sin `async`: el título sale sin esperar a nada. Ver `CambiosBody`. */
export default function CambiosPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-paper">Cambios</h1>

      <Suspense fallback={<CambiosSkeleton />}>
        <CambiosBody />
      </Suspense>
    </div>
  )
}
