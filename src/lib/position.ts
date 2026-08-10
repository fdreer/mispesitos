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

  // Dentro del mismo día se procesan primero las entradas: sólo se puede
  // disponer de lo que ya se tiene. Sin este desempate el resultado dependería
  // del orden en que la base devolvió las filas, y la diferencia de cambio que
  // ve el usuario cambiaría sola.
  //
  // ponytail: dos salidas del mismo día se desempatan por monto y después por
  // TC. Es una elección arbitraria — con la posición en descubierto el orden sí
  // cambia el resultado, y a nivel día no hay forma de saber cuál pasó primero.
  // Arbitraria pero fija: el número no baila entre recargas.
  //
  // Task 15 evaluó agregar acá un campo de secuencia (id o created_at) como
  // tercer criterio y lo descartó: sólo los cambios de divisa tienen
  // `created_at` en la base, las cuotas pagadas no tienen ninguna marca de
  // orden. Un desempate que sólo funciona para la mitad de los eventos sería
  // peor que este, que es arbitrario pero se aplica igual a todos y queda
  // documentado. El desempate que sí importa —las entradas antes que las
  // salidas en la misma fecha— ya está resuelto arriba.
  const ordered = [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.direction === b.direction ? 0 : a.direction === "in" ? -1 : 1) ||
      a.usdCents - b.usdCents ||
      a.rate - b.rate,
  )

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

/**
 * Fila cruda de `user_settings`, tal como la necesita el sembrado de la
 * posición inicial. `rate` llega como el `numeric` de la base, es decir
 * string — Drizzle no lo convierte solo.
 */
export type UsdInitialBalanceRow = {
  usdCents: number
  rate: string
  date: IsoDate
}

/** Fila cruda de un movimiento `exchange`. `rate` es el `numeric` de la base. */
export type UsdExchangeRow = {
  date: IsoDate
  usdCents: number
  rate: string
  direction: "buy" | "sell"
}

/** Fila cruda de una cuota pagada de un movimiento en USD. Idem `rate`. */
export type UsdPaidInstallmentRow = {
  date: IsoDate
  usdCents: number
  rate: string
  kind: "income" | "expense"
}

/**
 * Arma la lista de `PositionEvent` que consume `usdPosition`, a partir del
 * saldo inicial en dólares, los cambios de divisa y las cuotas pagadas en
 * USD. Es la parte PURA de `listUsdPositionEvents` (@/server/queries).
 *
 * Dos reglas que el plan original no traía:
 *
 * 1. Siembra el saldo inicial como un evento de entrada, sólo si hay dólares
 *    (`usdCents > 0`) — sembrar un evento de cero no aporta nada y ensucia el
 *    desempate por monto de `usdPosition`. Sin esto, alguien que declaró
 *    saldo inicial en dólares ve esos dólares en el dashboard pero CERO en
 *    /cambios, con la alerta de sobreventa encendida para siempre apenas
 *    gasta el primer dólar (`oversoldUsdCents` nunca baja).
 * 2. Filtra cambios y cuotas por `date >= initialBalance.date`.
 *    `computeBalances` (@/lib/balance) ya hace este mismo corte con
 *    `initialDate`; sin este filtro, un movimiento cargado con fecha
 *    anterior al saldo inicial quedaría contado acá y excluido allá, y las
 *    dos pantallas dejarían de coincidir para ese usuario.
 *
 * La conversión del `numeric` (string) a number pasa una sola vez por fila,
 * acá adentro — nadie más la repite.
 */
export function buildUsdPositionEvents(
  initialBalance: UsdInitialBalanceRow,
  exchanges: UsdExchangeRow[],
  paidUsdInstallments: UsdPaidInstallmentRow[],
): PositionEvent[] {
  const events: PositionEvent[] = []

  // La Task 11 exige TC > 0 cuando hay dólares iniciales (ver el `.refine` de
  // `settingsSchema` en @/lib/schemas), así que la app nunca puede guardar
  // una fila con dólares y TC en cero. Si por fuera de la app apareciera una
  // fila así, esta función sembraría igual un evento de entrada con
  // `rate: 0`: `usdPosition` sumaría esa cantidad sin aportar costo,
  // arrastrando el promedio hacia abajo en silencio. No hay camino
  // especulativo para eso acá — el guardia vive en el esquema, no acá.
  if (initialBalance.usdCents > 0) {
    events.push({
      date: initialBalance.date,
      usdCents: initialBalance.usdCents,
      rate: Number(initialBalance.rate),
      direction: "in",
    })
  }

  for (const exchange of exchanges) {
    if (exchange.date < initialBalance.date) continue
    events.push({
      date: exchange.date,
      usdCents: exchange.usdCents,
      rate: Number(exchange.rate),
      direction: exchange.direction === "buy" ? "in" : "out",
    })
  }

  for (const row of paidUsdInstallments) {
    if (row.date < initialBalance.date) continue
    events.push({
      date: row.date,
      usdCents: row.usdCents,
      rate: Number(row.rate),
      direction: row.kind === "income" ? "in" : "out",
    })
  }

  return events
}
