import { roundCents, convertToArs } from "@/lib/money"
import type { IsoDate } from "@/lib/dates"

export type PositionEvent = {
  date: IsoDate
  usdCents: number
  rate: number
  direction: "in" | "out"
}

export type UsdPosition = {
  usdCents: number
  costArsCents: number
  averageRate: number
  realizedArsCents: number
  oversoldUsdCents: number
}

export function usdPosition(events: PositionEvent[]): UsdPosition {
  let usdCents = 0
  let costArsCents = 0
  let realizedArsCents = 0
  let oversoldUsdCents = 0

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

    const available = Math.min(event.usdCents, usdCents)
    oversoldUsdCents += event.usdCents - available

    if (available > 0) {
      const averageRate = costArsCents / usdCents
      realizedArsCents += roundCents(available * (event.rate - averageRate))
      costArsCents -= convertToArs(available, averageRate)
      usdCents -= available
    }

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

export type UsdInitialBalanceRow = {
  usdCents: number
  rate: string
  date: IsoDate
}

export type UsdExchangeRow = {
  date: IsoDate
  usdCents: number
  rate: string
  direction: "buy" | "sell"
}

export type UsdPaidInstallmentRow = {
  date: IsoDate
  usdCents: number
  rate: string
  kind: "income" | "expense"
}

export function buildUsdPositionEvents(
  initialBalance: UsdInitialBalanceRow,
  exchanges: UsdExchangeRow[],
  paidUsdInstallments: UsdPaidInstallmentRow[],
): PositionEvent[] {
  const events: PositionEvent[] = []

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
