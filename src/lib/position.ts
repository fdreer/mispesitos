import { roundCents, convertToArs } from "@/lib/money"
import type { IsoDate } from "@/lib/dates"

/**
 * Un evento que toca la tenencia de dólares.
 * "in"  = compra de divisa o cuota cobrada de un ingreso en USD.
 * "out" = venta de divisa o cuota pagada de un egreso en USD.
 * `rate` es el tipo de cambio del día en que ocurrió.
 */
export type PositionEvent = {
  date: IsoDate
  usdCents: number
  rate: number
  direction: "in" | "out"
}

export type UsdPosition = {
  /** Dólares en tenencia, en centavos. Nunca negativo. */
  usdCents: number
  /** Costo de esa tenencia, en centavos de peso. */
  costArsCents: number
  /** Costo promedio ponderado, en pesos por dólar. Cero si no hay tenencia. */
  averageRate: number
  /** Diferencia de cambio realizada acumulada, en centavos de peso. */
  realizedArsCents: number
  /** Dólares que salieron sin respaldo registrado. Cero es lo normal. */
  oversoldUsdCents: number
}

/**
 * Recorre los eventos en orden de fecha llevando cantidad y costo.
 *
 * Toda ENTRADA suma al costo a su propio TC.
 * Toda SALIDA realiza (rate - promedio) * cantidad y descarga a costo promedio,
 * sin distinguir entre vender la divisa y gastarla: en ambos casos se dispone
 * de ella y la ganancia acumulada durante la tenencia se hace efectiva.
 */
export function usdPosition(events: PositionEvent[]): UsdPosition {
  let usdCents = 0
  let costArsCents = 0
  let realizedArsCents = 0
  let oversoldUsdCents = 0

  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date))

  for (const event of ordered) {
    if (event.direction === "in") {
      usdCents += event.usdCents
      costArsCents += convertToArs(event.usdCents, event.rate)
      continue
    }

    // Sólo se puede disponer de lo que está registrado. El excedente se informa.
    const available = Math.min(event.usdCents, usdCents)
    oversoldUsdCents += event.usdCents - available

    if (available > 0) {
      const averageRate = costArsCents / usdCents
      // No es una conversión de moneda: es una diferencia de TC (rate - promedio)
      // multiplicada por una cantidad de dólares. convertToArs multiplica un
      // importe en dólares por UNA cotización; acá se multiplica por una resta
      // de dos cotizaciones, así que no le corresponde a esa función.
      realizedArsCents += roundCents(available * (event.rate - averageRate))
      costArsCents -= convertToArs(available, averageRate)
      usdCents -= available
    }

    // Sin tenencia no hay costo remanente: evita arrastrar centavos de redondeo.
    if (usdCents === 0) costArsCents = 0
  }

  return {
    usdCents,
    costArsCents,
    averageRate: usdCents > 0 ? costArsCents / usdCents : 0,
    realizedArsCents,
    oversoldUsdCents,
  }
}
