import { ExchangeForm } from "@/components/exchange-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import { usdPosition } from "@/lib/position"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listExchanges, listUsdPositionEvents } from "@/server/queries"
import { requireSettings } from "@/server/session"

export default async function CambiosPage() {
  const { user, settings } = await requireSettings()

  const [events, exchanges, rate] = await Promise.all([
    listUsdPositionEvents(user.id),
    listExchanges(user.id),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const position = usdPosition(events)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cambios</h1>

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

      <ExchangeForm buyRate={rate?.buyRate ?? null} sellRate={rate?.sellRate ?? null} />

      <ul className="divide-y">
        {exchanges.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-3">
            <span>
              {e.date} · {e.direction === "buy" ? "Compra" : "Venta"} a {Number(e.rate).toFixed(2)}
            </span>
            <span className="tabular-nums">{formatMoney(e.amountCents, "USD")}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
