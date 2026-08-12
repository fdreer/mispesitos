import { Suspense } from "react"

import { ExchangeForm } from "@/components/exchange-form"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatIsoForDisplay, todayInAr } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { usdPosition } from "@/lib/position"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listExchanges, listUsdPositionEvents } from "@/server/queries"
import { requireSettings } from "@/server/session"

/**
 * Todo lo que hay debajo del título, detrás de un Suspense: el título sale en
 * el primer flush en vez de esperar a la cotización, que sola puede tardar 3s
 * (TIMEOUT_MS en @/lib/rate) y era lo que hacía que esta pantalla entera se
 * quedara en el esqueleto genérico.
 *
 * Un solo límite y no uno por bloque, aunque acá los datos SÍ son separables:
 * si el formulario tuviera el suyo propio, React lo montaría primero sin
 * cotización y lo reemplazaría al llegar —dos instancias distintas—, así que
 * lo que la persona hubiera empezado a tipear en esos segundos se perdería al
 * hacer el cambio. Con un solo límite el formulario se monta una vez, ya con
 * su cotización adentro.
 */
async function CambiosBody() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [events, exchanges, rate] = await Promise.all([
    listUsdPositionEvents(user.id),
    // El mismo piso de fecha que usa listUsdPositionEvents para las tres
    // tarjetas de arriba: una operación anterior al saldo inicial no las mueve,
    // así que tampoco tiene que aparecer en la lista de abajo.
    listExchanges(user.id, settings.initialBalanceDate),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const position = usdPosition(events)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tenencia</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl tabular-nums">
            {formatMoney(position.usdCents, "USD")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">TC promedio</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl tabular-nums">
            {position.averageRate > 0 ? position.averageRate.toFixed(2) : "—"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Diferencia de cambio</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl tabular-nums">
            {formatMoney(position.realizedArsCents, "ARS")}
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

      {/* Adentro de una tarjeta, como el resto de los bloques de la app: antes
          era una lista suelta colgando debajo del formulario, sin nada que
          dijera dónde empezaba el historial ni qué era. */}
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
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2">
                    {/* El sentido de la operación como badge y no como texto
                        corrido: es el único dato de la fila que se escanea, y
                        en texto quedaba enterrado entre la fecha y el TC. */}
                    <Badge variant={e.direction === "buy" ? "success" : "warning"}>
                      {e.direction === "buy" ? "Compra" : "Venta"}
                    </Badge>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatIsoForDisplay(e.date)} · a {Number(e.rate).toFixed(2)}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatMoney(e.amountCents, "USD")}</span>
                </li>
              ))}
            </ul>
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
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[132px] animate-pulse rounded-xl border border-border" />
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
