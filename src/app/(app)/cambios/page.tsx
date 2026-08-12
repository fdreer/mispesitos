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

/**
 * Una operación del historial. El botón de borrar es el mismo de /ingresos y
 * /egresos: hasta ahora ésta era la única lista de la app sin forma de sacar
 * una fila, y es justo donde más falta hacía —una compra cargada con la fecha
 * equivocada no se puede corregir, sólo borrar y volver a cargar.
 */
function FilaDeCambio({ exchange }: { exchange: Movement }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2">
        {/* El sentido de la operación como badge y no como texto corrido: es
            el único dato de la fila que se escanea, y en texto quedaba
            enterrado entre la fecha y el TC. */}
        <Badge variant={exchange.direction === "buy" ? "success" : "warning"}>
          {exchange.direction === "buy" ? "Compra" : "Venta"}
        </Badge>
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatIsoForDisplay(exchange.date)} · a {Number(exchange.rate).toFixed(2)}
        </span>
      </div>
      {/* `div` y no `span`: `DeleteMovementButton` monta un div, que no puede
          vivir adentro de un span. */}
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{formatMoney(exchange.amountCents, "USD")}</span>
        <DeleteMovementButton id={exchange.id} description={exchange.description} />
      </div>
    </li>
  )
}

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

  const [todosLosCambios, events, rate] = await Promise.all([
    // Sin piso de fecha, y el corte se hace acá abajo en memoria: son pocas
    // filas y hacen falta las dos mitades. Las que quedan por debajo del saldo
    // inicial no pueden desaparecer de la pantalla —no aparecen en /ingresos ni
    // en /egresos, así que ésta es la única donde se pueden ver y borrar— pero
    // tampoco pueden mezclarse con las que sí mueven las tarjetas de arriba.
    listExchanges(user.id),
    listUsdPositionEvents(user.id),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const exchanges = todosLosCambios.filter((e) => e.date >= settings.initialBalanceDate)
  const anteriores = todosLosCambios.filter((e) => e.date < settings.initialBalanceDate)

  const position = usdPosition(events)

  return (
    <>
      {/* Mismo tamaño y mismo patrón de encabezado que las tarjetas del
          dashboard (`BalanceCards`): `size="sm"` y el ícono de ayuda al lado
          del título, no una tarjeta más grande y muda al lado. */}
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
                <FilaDeCambio key={e.id} exchange={e} />
              ))}
            </ul>
          )}

          {/*
           * Las operaciones anteriores al saldo inicial, aparte y rotuladas. El
           * piso de fecha de arriba está bien —no mueven las tarjetas, así que
           * no pueden mezclarse con las que sí—, pero sin este bloque quedaban
           * invisibles en toda la app: no salen en /ingresos ni en /egresos, y
           * ésta era la única lista donde podían estar. Una fecha mal tipeada
           * dejaba una fila muerta en `movement` que reaparecía en todos los
           * saldos el día que se moviera la fecha del saldo inicial, sin que
           * nadie hubiera podido verla ni borrarla.
           */}
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
