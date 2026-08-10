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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Saldo en pesos</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl tabular-nums">
          {formatMoney(arsCents, "ARS")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Saldo en dólares</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl tabular-nums">{formatMoney(usdCents, "USD")}</p>
          {/*
           * A propósito distinto de la "Tenencia" de /cambios (usdPosition):
           * este saldo sale de computeBalances y puede quedar negativo si se
           * gastó de más, mientras que la tenencia se clampea en cero y
           * acumula la diferencia como sobreventa. /cambios ya explica la
           * relación entre los dos números; esta leyenda sólo evita que verlos
           * distintos parezca un error de la app.
           */}
          <p className="text-muted-foreground text-xs">
            Puede quedar negativo. No es la tenencia de Cambios.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total consolidado</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl tabular-nums">
            {consolidatedArsCents === null ? "—" : formatMoney(consolidatedArsCents, "ARS")}
          </p>
          <p className="text-muted-foreground text-xs">
            {rate ? `dólar a ${rate.toFixed(2)}` : "sin cotización de hoy"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          {/*
           * El título dice qué mide, porque en esta pantalla conviven dos
           * definiciones distintas de "el mes": acá es CAJA —lo que entró y
           * salió de verdad, cuota por cuota, el día que se pagó— y en la torta
           * y las barras de abajo es el importe total del movimiento en el mes
           * de su fecha. Un televisor en 12 cuotas cargado este mes vale
           * $1.200.000 allá y $100.000 acá: los dos números están bien, miden
           * cosas distintas, y hasta ahora nada en la pantalla lo decía.
           */}
          <CardTitle className="text-sm font-medium">Cobrado y pagado este mes</CardTitle>
        </CardHeader>
        <CardContent>
          {/*
           * Sin verde ni rojo: en este sistema el color señala estado, no
           * importe, y el signo ya dice si el mes cerró para arriba o para
           * abajo. El detalle de cuánto entró y cuánto salió está en la línea
           * de abajo.
           */}
          <p className="text-2xl tabular-nums">{formatMoney(diff, "ARS")}</p>
          <p className="text-muted-foreground text-xs">
            {formatMoney(monthIncomeArsCents, "ARS")} cobrados ·{" "}
            {formatMoney(monthExpenseArsCents, "ARS")} pagados
          </p>
          <p className="text-muted-foreground text-xs">
            Cuenta cada cuota en el mes en que la marcaste pagada, no en el mes en que cargaste
            el movimiento.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
