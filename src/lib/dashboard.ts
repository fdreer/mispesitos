import { addMonthsClamped, monthKey, type IsoDate } from "@/lib/dates"
import { convertToArs } from "@/lib/money"

export type PendingItem = {
  dueDate: IsoDate
  arsCents: number
  kind: "income" | "expense"
}

/**
 * Punto de partida de la proyección, en la MISMA escala que lo que se le va a
 * aplicar: pesos consolidados.
 *
 * Antes se arrancaba en `balances.arsCents` —sólo pesos— y encima se le
 * aplicaban cuotas en dólares ya convertidas a pesos. Para alguien con dólares
 * ahorrados la curva arrancaba por debajo de su saldo real y después le
 * descontaba deudas en dólares valuadas en pesos: dos tratamientos de moneda
 * en la misma serie. El spec (7.1) pide estos bloques consolidados en pesos.
 *
 * Devuelve null cuando no alcanza para consolidar honestamente: la cotización
 * de hoy sale de una API de terceros que puede fallar. Sin dólares en el saldo
 * no hay nada que consolidar y el rate no hace falta — ese caso sigue dando un
 * número exacto aunque la API esté caída.
 */
export function projectionStartArsCents(
  balances: { arsCents: number; usdCents: number },
  todayRate: number | null,
): number | null {
  if (balances.usdCents === 0) return balances.arsCents
  if (todayRate === null) return null
  return balances.arsCents + convertToArs(balances.usdCents, todayRate)
}

/**
 * Saldo proyectado mes a mes, partiendo de `startArsCents` y aplicando los
 * vencimientos pendientes por su fecha. Lo ya vencido pesa en el mes actual,
 * porque sigue debiéndose.
 *
 * Cada punto es el saldo AL CIERRE de su mes, no al principio: el primero ya
 * trae aplicado todo lo que vence este mes más lo atrasado, así que no es el
 * saldo de hoy y la pantalla no puede rotularlo como si lo fuera.
 */
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
    // Atrasado => pesa hoy. Más allá del horizonte => no se muestra.
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

export function spendByCategory(
  expenses: { categoryId: string | null; arsCents: number }[],
  categories: { id: string; name: string }[],
): { name: string; arsCents: number }[] {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const totals = new Map<string, number>()

  for (const expense of expenses) {
    const name = (expense.categoryId && names.get(expense.categoryId)) || "Sin categoría"
    totals.set(name, (totals.get(name) ?? 0) + expense.arsCents)
  }

  return [...totals.entries()]
    .map(([name, arsCents]) => ({ name, arsCents }))
    .sort((a, b) => b.arsCents - a.arsCents)
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
