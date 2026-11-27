import { convertToArs, type Currency } from "@/lib/money"
import type { IsoDate } from "@/lib/dates"

export type BalanceSettings = {
  initialArsCents: number
  initialUsdCents: number
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
 * El saldo a una fecha: lo inicial más lo pagado/cobrado y los cambios entre
 * `initialDate` y `asOf` (inclusive). Sin `asOf` suma todo lo que llega.
 *
 * Dashboard, Informe de flujo y el detalle de tarjeta pasan `asOf = hoy`:
 * una cuota pagada o un cambio con fecha futura todavía no movió la plata, y
 * contarlo en un lugar y no en otro deja dos saldos distintos para el mismo día.
 */
export function computeBalances(
  settings: BalanceSettings,
  paid: PaidInstallment[],
  exchanges: ExchangeMovement[],
  asOf?: IsoDate,
): Balances {
  let arsCents = settings.initialArsCents
  let usdCents = settings.initialUsdCents

  for (const item of paid) {
    if (item.paidDate < settings.initialDate) continue
    if (asOf !== undefined && item.paidDate > asOf) continue

    const signed = item.kind === "income" ? item.amountCents : -item.amountCents
    if (item.currency === "ARS") arsCents += signed
    else usdCents += signed
  }

  for (const exchange of exchanges) {
    if (exchange.date < settings.initialDate) continue
    if (asOf !== undefined && exchange.date > asOf) continue

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
