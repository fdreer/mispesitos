/**
 * Los supuestos que las columnas `kind` y `direction` de `movement` no pueden
 * declarar solas.
 *
 * Las dos son `text` en la base y `string | null` en el tipo de Drizzle, pero
 * cada consulta que las lee ya sabe más que eso: si filtró por
 * `kind = "exchange"`, la dirección tiene que ser "buy" o "sell"; si viene de
 * una cuota, el tipo tiene que ser "income" o "expense".
 *
 * Ese "tiene que" se sostiene con un assert y no con un `as`. Un `as` afirma
 * lo mismo pero no comprueba nada: el día que el supuesto deje de valer, el
 * valor inesperado sigue viaje y termina clasificado en silencio en la rama
 * del `else` —un cambio sin dirección contado como venta, una cuota rara
 * contada como egreso—. Mejor que reviente acá, fuerte y visible.
 *
 * Viven en `@/lib` y no en `@/server/queries` porque los usan los dos lados:
 * las consultas del servidor y el dashboard, que arma las mismas listas. Una
 * sola definición, un solo comportamiento ante la misma fila mala.
 */

import type { Currency } from "@/lib/money"

/**
 * `movement.currency` es "ARS" o "USD", y lo hace cumplir el Zod de las Server
 * Actions — pero la columna es `text` y el tipo de Drizzle es `string`.
 *
 * Es el mismo agujero que el `direction` nulo, en otra columna: con un `as`,
 * una moneda inesperada se cuela sin ruido y `computeBalances` la clasifica en
 * el `else`, o sea la cuenta como DÓLARES. Un importe en una moneda que no
 * existe sumado al saldo en dólares y valuado al TC del día no se parece en
 * nada a un error: se parece a un saldo.
 */
export function assertCurrency(currency: string): Currency {
  if (currency === "ARS" || currency === "USD") return currency
  throw new Error(`Movimiento con currency inesperada: ${JSON.stringify(currency)}`)
}

/**
 * `movement.direction` sólo se llena para `kind: "exchange"`
 * (`createExchange` siempre lo setea). Quien llame acá ya tiene que haber
 * filtrado por ese tipo.
 */
export function assertExchangeDirection(direction: string | null): "buy" | "sell" {
  if (direction === "buy" || direction === "sell") return direction
  throw new Error(`Cambio de divisa con direction inesperada: ${JSON.stringify(direction)}`)
}

/**
 * `movement.kind` puede ser "income" | "expense" | "exchange", pero un
 * movimiento con cuotas nunca es un cambio de divisa: los exchange no generan
 * cuotas. Sirve para la fila del movimiento y para el `kind` que llega por el
 * join desde una cuota — es el mismo supuesto de los dos lados.
 */
export function assertInstallmentMovementKind(kind: string): "income" | "expense" {
  if (kind === "income" || kind === "expense") return kind
  throw new Error(
    `Movimiento con cuotas y kind inesperado (se esperaba income o expense): ${JSON.stringify(kind)}`,
  )
}
