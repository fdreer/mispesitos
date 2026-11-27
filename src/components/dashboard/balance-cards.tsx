import { InfoHint } from "@/components/info-hint"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import { formatOfficialRateLabel, type OfficialRateSnapshot } from "@/lib/rate"

type Props = {
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  officialRate: OfficialRateSnapshot | null
  paymentsThisMonth: { arsCents: number; usdCents: number; count: number; overdueCount: number }
  paymentsNextMonth: { arsCents: number; usdCents: number; count: number }
}

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
  officialRate,
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
        <BalanceHeader
          title="Saldo en dólares"
          hint="Saldo real en dólares (efectivo + bancos). Puede quedar negativo si gastaste más dólares de los que tenías cargados."
        />
        <CardContent>
          <BalanceAmount>{formatMoney(usdCents, "USD", 0)}</BalanceAmount>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader
          title="Total consolidado"
          hint="Saldo en pesos más saldo en dólares valuado al oficial comprador, igual que el punto de partida del flujo de caja."
        />
        <CardContent>
          <BalanceAmount>
            {consolidatedArsCents === null ? "—" : formatMoney(consolidatedArsCents, "ARS", 0)}
          </BalanceAmount>
          <BalanceNote>
            {officialRate
              ? `${formatOfficialRateLabel(officialRate.fetchedAt)} · ${Math.round(officialRate.compra).toLocaleString("es-AR")}`
              : "sin cotización oficial"}
          </BalanceNote>
        </CardContent>
      </Card>

      <Card size="sm" className="gap-2 py-3">
        <BalanceHeader
          title="Impagos este mes"
          hint="Incluye egresos vencidos de meses anteriores y los que vencen durante este mes, separados por moneda."
        />
        <CardContent>
          <BalanceAmount>{formatMoney(paymentsThisMonth.arsCents, "ARS", 0)}</BalanceAmount>
          {paymentsThisMonth.usdCents > 0 && (
            <BalanceNote>+ {formatMoney(paymentsThisMonth.usdCents, "USD", 0)}</BalanceNote>
          )}
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
          hint="Incluye sólo egresos pendientes cuyo vencimiento cae en el próximo mes calendario, separados por moneda."
        />
        <CardContent>
          <BalanceAmount>{formatMoney(paymentsNextMonth.arsCents, "ARS", 0)}</BalanceAmount>
          {paymentsNextMonth.usdCents > 0 && (
            <BalanceNote>+ {formatMoney(paymentsNextMonth.usdCents, "USD", 0)}</BalanceNote>
          )}
          <BalanceNote>
            {paymentsNextMonth.count} {paymentsNextMonth.count === 1 ? "concepto" : "conceptos"}
          </BalanceNote>
        </CardContent>
      </Card>
    </div>
  )
}
