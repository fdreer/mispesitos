import { addMonthsClamped, monthKey, type IsoDate } from "@/lib/dates"
import { convertToArs } from "@/lib/money"

export type PendingItem = {
  dueDate: IsoDate
  arsCents: number
  kind: "income" | "expense"
}

export function projectionStartArsCents(
  balances: { arsCents: number; usdCents: number },
  todayRate: number | null,
): number | null {
  if (balances.usdCents === 0) return balances.arsCents
  if (todayRate === null) return null
  return balances.arsCents + convertToArs(balances.usdCents, todayRate)
}

export function projectBalance(
  startArsCents: number,
  pending: PendingItem[],
  months: number,
  today: IsoDate,
): { month: string; arsCents: number }[] {
  const keys = Array.from({ length: months }, (_, i) =>
    monthKey(addMonthsClamped(today, i)),
  )

  const deltas = new Map<string, number>(keys.map((k) => [k, 0]))
  const currentMonth = keys[0]
  const lastMonth = keys.at(-1)!

  for (const item of pending) {
    const key = monthKey(item.dueDate)
    const bucket = key < currentMonth ? currentMonth : key
    if (bucket > lastMonth) continue

    const signed = item.kind === "income" ? item.arsCents : -item.arsCents
    deltas.set(bucket, (deltas.get(bucket) ?? 0) + signed)
  }

  let running = startArsCents
  return keys.map((month) => {
    running += deltas.get(month) ?? 0
    return { month, arsCents: running }
  })
}

export function monthlyTotals(
  movements: { date: IsoDate; kind: "income" | "expense"; arsCents: number }[],
  months: number,
  today: IsoDate,
): { month: string; incomeArsCents: number; expenseArsCents: number }[] {
  const keys = Array.from({ length: months }, (_, i) =>
    monthKey(addMonthsClamped(today, i - months + 1)),
  )

  const buckets = new Map(
    keys.map((k) => [k, { month: k, incomeArsCents: 0, expenseArsCents: 0 }]),
  )

  for (const m of movements) {
    const bucket = buckets.get(monthKey(m.date))
    if (!bucket) continue
    if (m.kind === "income") bucket.incomeArsCents += m.arsCents
    else bucket.expenseArsCents += m.arsCents
  }

  return keys.map((k) => buckets.get(k)!)
}
