import { addMonthsClamped, monthKey, type IsoDate } from "@/lib/dates"

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
