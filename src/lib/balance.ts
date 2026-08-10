import { convertToArs, type Currency } from "@/lib/money"
import type { IsoDate } from "@/lib/dates"

export type BalanceSettings = {
  initialArsCents: number
  initialUsdCents: number
  /** Desde esta fecha cuentan los movimientos. Lo anterior ya está en el saldo inicial. */
  initialDate: IsoDate
}

export type PaidInstallment = {
  paidDate: IsoDate
  currency: Currency
  kind: "income" | "expense"
  amountCents: number
}

export type ExchangeMovement = {
  date: IsoDate
  direction: "buy" | "sell"
  usdCents: number
  rate: number
}

export type Balances = {
  arsCents: number
  usdCents: number
}

/**
 * Saldo actual por moneda, según la sección 5.2 del spec.
 * Una cuota cuenta por su fecha de pago real, no por su vencimiento.
 */
export function computeBalances(
  settings: BalanceSettings,
  paid: PaidInstallment[],
  exchanges: ExchangeMovement[],
): Balances {
  let arsCents = settings.initialArsCents
  let usdCents = settings.initialUsdCents

  for (const item of paid) {
    if (item.paidDate < settings.initialDate) continue

    const signed = item.kind === "income" ? item.amountCents : -item.amountCents
    if (item.currency === "ARS") arsCents += signed
    else usdCents += signed
  }

  for (const exchange of exchanges) {
    if (exchange.date < settings.initialDate) continue

    const arsLeg = convertToArs(exchange.usdCents, exchange.rate)
    if (exchange.direction === "buy") {
      arsCents -= arsLeg
      usdCents += exchange.usdCents
    } else {
      arsCents += arsLeg
      usdCents -= exchange.usdCents
    }
  }

  return { arsCents, usdCents }
}
