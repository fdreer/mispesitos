import type { IsoDate } from "@/lib/dates"
import type { Currency } from "@/lib/money"

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

/**
 * `installment.paid_date` es `string | null` en el tipo de Drizzle porque la
 * columna es nullable: una cuota impaga no tiene fecha de pago. Pero
 * `listPaidInstallments` (@/server/queries) ya filtró `paid = true`, y con
 * `paid = true` la CHECK `installment_paid_date_required_when_paid`
 * (migración 0009) exige `paid_date` no nulo.
 *
 * Con un `as`, una fila que rompiera esa garantía se colaría sin ruido: la
 * cuota se caería en silencio de la tarjeta que arma con estas fechas,
 * mientras el saldo la sigue contando igual. Un null acá no es un dato
 * faltante más, es la CHECK dejando de sostenerse — mejor que reviente fuerte
 * y visible.
 */
export function assertPaidDate(paidDate: string | null): IsoDate {
  if (paidDate !== null) return paidDate
  throw new Error(`Cuota pagada sin paidDate: ${JSON.stringify(paidDate)}`)
}
