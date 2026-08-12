import { InfoHint } from "@/components/info-hint"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"

type Props = {
  arsCents: number
  usdCents: number
  consolidatedArsCents: number | null
  rate: number | null
  monthIncomeArsCents: number
  monthExpenseArsCents: number
}

/**
 * El encabezado de las cuatro tarjetas: siempre el mismo título atenuado, y el
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
 * El número, con el mismo tamaño y la misma alineación en las cuatro. Es lo
 * único que se viene a mirar acá, así que es lo único que se lee de lejos.
 */
export function BalanceAmount({ children }: { children: React.ReactNode }) {
  return <p className="text-xl tabular-nums">{children}</p>
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
  monthIncomeArsCents,
  monthExpenseArsCents,
}: Props) {
  const diff = monthIncomeArsCents - monthExpenseArsCents

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card size="sm">
        <BalanceHeader title="Saldo en pesos" />
        <CardContent>
          <BalanceAmount>{formatMoney(arsCents, "ARS")}</BalanceAmount>
        </CardContent>
      </Card>

      <Card size="sm">
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
          <BalanceAmount>{formatMoney(usdCents, "USD")}</BalanceAmount>
        </CardContent>
      </Card>

      <Card size="sm">
        <BalanceHeader title="Total consolidado" />
        <CardContent>
          <BalanceAmount>
            {consolidatedArsCents === null ? "—" : formatMoney(consolidatedArsCents, "ARS")}
          </BalanceAmount>
          <BalanceNote>{rate ? `dólar a ${rate.toFixed(2)}` : "sin cotización de hoy"}</BalanceNote>
        </CardContent>
      </Card>

      <Card size="sm">
        {/*
         * El título dice qué mide, porque en esta pantalla conviven dos
         * definiciones distintas de "el mes": acá es CAJA —lo que entró y
         * salió de verdad, cuota por cuota, el día que se pagó— y en la torta
         * y las barras de abajo es el importe total del movimiento en el mes
         * de su fecha. Un televisor en 12 cuotas cargado este mes vale
         * $1.200.000 allá y $100.000 acá.
         */}
        <BalanceHeader
          title="Cobrado y pagado este mes"
          hint="Cuenta cada cuota en el mes en que la marcaste pagada, no en el mes en que cargaste el movimiento. Los gráficos de abajo usan el criterio contrario."
        />
        <CardContent>
          {/*
           * Sin verde ni rojo: en este sistema el color señala estado, no
           * importe, y el signo ya dice si el mes cerró para arriba o para
           * abajo. El detalle de cuánto entró y cuánto salió está debajo.
           */}
          <BalanceAmount>{formatMoney(diff, "ARS")}</BalanceAmount>
          <BalanceNote>
            {formatMoney(monthIncomeArsCents, "ARS")} cobrados ·{" "}
            {formatMoney(monthExpenseArsCents, "ARS")} pagados
          </BalanceNote>
        </CardContent>
      </Card>
    </div>
  )
}
