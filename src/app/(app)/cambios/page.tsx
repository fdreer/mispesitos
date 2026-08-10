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
          <CardContent
            className={
              position.realizedArsCents >= 0
                ? "text-2xl tabular-nums text-emerald-600"
                : "text-destructive text-2xl tabular-nums"
            }
          >
            {formatMoney(position.realizedArsCents, "ARS")}
          </CardContent>
        </Card>
      </div>

      {position.oversoldUsdCents > 0 && (
        <p className="text-destructive text-sm">
          Alguna vez saliste de más dólares de los que tenías cargados: en total,{" "}
          {formatMoney(position.oversoldUsdCents, "USD")}. Puede que te falte cargar alguna
          compra o algún ingreso en dólares de esa fecha. Es un número acumulado: aunque lo
          cargues, este aviso no se apaga solo.
        </p>
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
