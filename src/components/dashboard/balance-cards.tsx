import { InfoHint } from "@/components/info-hint"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"

type Props = {
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  rate: number | null
  paymentsThisMonth: { arsCents: number; count: number; overdueCount: number }
  paymentsNextMonth: { arsCents: number; count: number }
}

/**
 * El encabezado de las cinco tarjetas: siempre el mismo título atenuado, y el
 * ícono de ayuda sólo en las que tienen algo que aclarar. Una sola definición
 * para que los cuatro títulos no puedan separarse en tamaño o color.
 */
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
 * El número, con el mismo tamaño y la misma alineación en las cinco. Es lo
 * único que se viene a mirar acá, así que es lo único que se lee de lejos.
 */
export function BalanceAmount({ children }: { children: React.ReactNode }) {
  return <p className="text-xl tabular-nums whitespace-nowrap">{children}</p>
}

/** La línea de contexto: un solo renglón, siempre debajo del número. */
export function BalanceNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-xs">{children}</p>
}

export function BalanceCards({
  arsCents,
  usdCents,
  consolidatedArsCents,
  rate,
  paymentsThisMonth,
  paymentsNextMonth,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-5xl lg:grid-cols-5">
      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader title="Saldo en pesos" />
        <CardContent>
          <BalanceAmount>{formatMoney(arsCents, "ARS", 0)}</BalanceAmount>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2 py-3">
        {/*
         * A propósito distinto de la "Tenencia" de /cambios (usdPosition):
         * este saldo sale de computeBalances y puede quedar negativo si se
         * gastó de más, mientras que la tenencia se clampea en cero y
         * acumula la diferencia como sobreventa. /cambios ya explica la
         * relación entre los dos números; esta aclaración sólo evita que
         * verlos distintos parezca un error de la app.
         */}
        <BalanceHeader
          title="Saldo en dólares"
          hint="Puede quedar negativo si gastaste más dólares de los que tenías cargados. No es lo mismo que la tenencia de Cambios, que nunca baja de cero."
        />
        <CardContent>
          <BalanceAmount>{formatMoney(usdCents, "USD", 0)}</BalanceAmount>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader title="Total consolidado" />
        <CardContent>
          <BalanceAmount>
            {consolidatedArsCents === null ? "—" : formatMoney(consolidatedArsCents, "ARS", 0)}
          </BalanceAmount>
          <BalanceNote>{rate ? `dólar a ${Math.round(rate).toLocaleString("es-AR")}` : "sin cotización de hoy"}</BalanceNote>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader
          title="Impagos este mes"
          hint="Incluye egresos vencidos de meses anteriores y los que vencen durante este mes. Los importes en dólares usan el tipo de cambio guardado en cada movimiento."
        />
        <CardContent>
          <BalanceAmount>{formatMoney(paymentsThisMonth.arsCents, "ARS", 0)}</BalanceAmount>
          <BalanceNote>
            {paymentsThisMonth.count} {paymentsThisMonth.count === 1 ? "concepto" : "conceptos"}
            {paymentsThisMonth.overdueCount > 0 &&
              ` · ${paymentsThisMonth.overdueCount} ${paymentsThisMonth.overdueCount === 1 ? "vencido" : "vencidos"}`}
          </BalanceNote>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader
          title="A pagar el mes próximo"
          hint="Incluye sólo egresos pendientes cuyo vencimiento cae en el próximo mes calendario. Los importes en dólares usan el tipo de cambio guardado en cada movimiento."
        />
        <CardContent>
          <BalanceAmount>{formatMoney(paymentsNextMonth.arsCents, "ARS", 0)}</BalanceAmount>
          <BalanceNote>
            {paymentsNextMonth.count} {paymentsNextMonth.count === 1 ? "concepto" : "conceptos"}
          </BalanceNote>
        </CardContent>
      </Card>
    </div>
  )
}
