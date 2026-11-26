import { formatMonthLabel, isValidIsoDate, monthKey, addDaysIso, type IsoDate } from "@/lib/dates"
import { convertToArs } from "@/lib/money"
import { assertCurrency } from "@/lib/movement-asserts"
import { summarizeMovementStatus, type MovementStatus } from "@/lib/movement-status"

/**
 * Cómputos puros sobre la lista de movimientos ya filtrada (Fase 4 del plan
 * v2): conteos de estado para las pastillas, totales por estado, orden,
 * agrupación y plurales correctos.
 *
 * Vive en `@/lib` para que el Server Component y los tests unitarios lo usen
 * sin tocar la base ni React.
 */

export type InstallmentLike = {
  amountCents: number
  dueDate: IsoDate
  paid: boolean
}

export type MovementForList = {
  id: string
  date: IsoDate
  amountCents: number
  currency: string
  rate: string
  createdAt: Date | number | string
  installments: InstallmentLike[]
}

export type StatusCounts = {
  all: number
  overdue: number
  pending: number
  paid: number
}

export function summarizeMovementCounts(
  movements: readonly MovementForList[],
  today: IsoDate,
): StatusCounts {
  let overdue = 0
  let pending = 0
  let paid = 0

  for (const m of movements) {
    const { status } = summarizeMovementStatus(m.installments, today)
    if (status === "overdue") overdue++
    else if (status === "pending") pending++
    else paid++
  }

  return { all: movements.length, overdue, pending, paid }
}

export type CurrencyBucket = {
  arsCents: number
  usdCents: number
}

export type FilterTotals = {
  pending: CurrencyBucket
  overdue: CurrencyBucket
  paid: CurrencyBucket
}

/**
 * Totales de la lista por estado de cuota (§4: "Pendiente: $X · Vencido: $Y ·
 * Pagado: $Z"). Se calcula cuota por cuota —no por el estado entero del
 * movimiento— para respetar el criterio de lo percibido (§0): una compra en 3
 * cuotas con 1 pagada y 2 impagas suma 1/3 a Pagado y 2/3 a Pendiente/Vencido.
 */
export function summarizeMovementTotals(
  movements: readonly MovementForList[],
  today: IsoDate,
): FilterTotals {
  const totals: FilterTotals = {
    pending: { arsCents: 0, usdCents: 0 },
    overdue: { arsCents: 0, usdCents: 0 },
    paid: { arsCents: 0, usdCents: 0 },
  }

  for (const m of movements) {
    const currency = assertCurrency(m.currency)
    for (const i of m.installments) {
      const bucket: MovementStatus = i.paid
        ? "paid"
        : i.dueDate < today
          ? "overdue"
          : "pending"
      if (currency === "ARS") totals[bucket].arsCents += i.amountCents
      else totals[bucket].usdCents += i.amountCents
    }
  }

  return totals
}

/**
 * Menor vencimiento impago de un movimiento, o `null` si todas sus cuotas
 * están pagas. Define tanto el orden por vencimiento como el grupo en egresos.
 */
export function earliestUnpaidDueDate(installments: readonly InstallmentLike[]): IsoDate | null {
  let min: IsoDate | null = null
  for (const i of installments) {
    if (!i.paid && (min === null || i.dueDate < min)) min = i.dueDate
  }
  return min
}

export type MovementSort = "due" | "date" | "amount"

function createdAtMs(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return value
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function compareDateDesc(a: MovementForList, b: MovementForList): number {
  if (a.date !== b.date) return a.date > b.date ? -1 : 1
  const diffCreated = createdAtMs(b.createdAt) - createdAtMs(a.createdAt)
  if (diffCreated !== 0) return diffCreated
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0
}

function amountInArs(m: MovementForList): number {
  const currency = assertCurrency(m.currency)
  return currency === "ARS" ? m.amountCents : convertToArs(m.amountCents, Number(m.rate))
}

/**
 * Ordena los movimientos según la elección de la barra (§4):
 * - `due`: primero los impagos por su vencimiento más cercano (ascendente, así
 *   los vencidos quedan arriba); luego los pagados del más reciente al más viejo.
 * - `date`: fecha descendente, desempate por alta e id.
 * - `amount`: importe consolidado a pesos descendente, para comparar ARS y USD
 *   en una misma lista sin mezclar escalas.
 */
export function sortMovements<T extends MovementForList>(
  movements: readonly T[],
  sort: MovementSort,
): T[] {
  const copy = [...movements]
  if (sort === "date") return copy.sort(compareDateDesc)
  if (sort === "amount") {
    return copy.sort((a, b) => {
      const diff = amountInArs(b) - amountInArs(a)
      return diff !== 0 ? diff : compareDateDesc(a, b)
    })
  }
  return copy.sort((a, b) => {
    const dueA = earliestUnpaidDueDate(a.installments)
    const dueB = earliestUnpaidDueDate(b.installments)
    if (dueA !== null && dueB !== null) {
      if (dueA !== dueB) return dueA < dueB ? -1 : 1
      return compareDateDesc(a, b)
    }
    if (dueA !== null) return -1
    if (dueB !== null) return 1
    return compareDateDesc(a, b)
  })
}

export type MovementGroupMode = "due" | "month" | "none"

export type MovementGroup<T> = {
  key: string
  label: string | null
  items: T[]
}

export function groupModeFor(kind: "income" | "expense", sort: MovementSort): MovementGroupMode {
  if (sort === "amount") return "none"
  if (sort === "due") return "due"
  return kind === "income" || sort === "date" ? "month" : "none"
}

/**
 * Agrupa los movimientos ya ordenados (§5.3):
 * - `"due"`: Vencidos · Esta semana (próximos 7 días contando hoy) · Este mes
 *   · Más adelante · Pagados/Cobrados. Sólo devuelve grupos con al menos un ítem.
 * - `"month"`: por mes de `m.date` ("Noviembre 2026"), preservando el orden.
 * - `"none"`: un único grupo sin encabezado (para orden por importe).
 */
export function groupMovements<T extends MovementForList>(
  movements: readonly T[],
  mode: MovementGroupMode,
  today: IsoDate,
  paidLabel = "Pagados",
): MovementGroup<T>[] {
  if (movements.length === 0) return []
  if (mode === "none") return [{ key: "all", label: null, items: [...movements] }]

  if (mode === "month") {
    const groups: MovementGroup<T>[] = []
    const byKey = new Map<string, MovementGroup<T>>()
    for (const m of movements) {
      const key = isValidIsoDate(m.date) ? monthKey(m.date) : "sin-fecha"
      let group = byKey.get(key)
      if (!group) {
        group = {
          key,
          label: key === "sin-fecha" ? "Sin fecha" : formatMonthLabel(key),
          items: [],
        }
        byKey.set(key, group)
        groups.push(group)
      }
      group.items.push(m)
    }
    return groups
  }

  const weekEnd = addDaysIso(today, 6)
  const currentMonth = monthKey(today)
  const buckets: Record<"overdue" | "week" | "month" | "later" | "paid", MovementGroup<T>> = {
    overdue: { key: "overdue", label: "Vencidos", items: [] },
    week: { key: "week", label: "Esta semana", items: [] },
    month: { key: "month", label: "Este mes", items: [] },
    later: { key: "later", label: "Más adelante", items: [] },
    paid: { key: "paid", label: paidLabel, items: [] },
  }

  for (const m of movements) {
    const due = earliestUnpaidDueDate(m.installments)
    if (due === null) {
      buckets.paid.items.push(m)
    } else if (due < today) {
      buckets.overdue.items.push(m)
    } else if (due <= weekEnd) {
      buckets.week.items.push(m)
    } else if (monthKey(due) === currentMonth) {
      buckets.month.items.push(m)
    } else {
      buckets.later.items.push(m)
    }
  }

  return Object.values(buckets).filter((g) => g.items.length > 0)
}

/** Pluralización simple en español ("1 pendiente", "2 pendientes"). */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}
