import { addMonthsClamped, formatRelativeDue, isValidIsoDate, type IsoDate } from "@/lib/dates"

export const MAX_INSTALLMENTS = 120

export type PlannedInstallment = {
  number: number
  amountCents: number
  dueDate: IsoDate
}

export function splitAmount(totalCents: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`La cantidad de cuotas debe ser un entero mayor a cero, no ${count}`)
  }
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error(`El total debe ser un entero de centavos no negativo, no ${totalCents}`)
  }

  const base = Math.floor(totalCents / count)
  const parts = new Array<number>(count).fill(base)
  parts[count - 1] = totalCents - base * (count - 1)

  return parts
}

/**
 * Plan completo de cuotas: importes repartidos y vencimientos mensuales
 * a partir de la fecha de la primera.
 */
export function buildInstallments(
  totalCents: number,
  count: number,
  firstDueDate: IsoDate,
): PlannedInstallment[] {
  return splitAmount(totalCents, count).map((amountCents, index) => ({
    number: index + 1,
    amountCents,
    dueDate: addMonthsClamped(firstDueDate, index),
  }))
}

/**
 * El número de cuota paga más alto de un movimiento, o 0 si no hay ninguna
 * paga.
 *
 * Existe para `updateMovement` (@/server/actions/movements), que rehace el plan
 * entero: si el plan nuevo tiene menos cuotas que este número, la edición
 * borraría el registro de un pago que sí ocurrió. Es el número más alto y no la
 * cantidad de pagas porque las cuotas se pueden marcar en cualquier orden —
 * pagar la 1 y la 5 de un plan de 12 es normal—, así que "hay dos pagas" no
 * dice nada sobre cuál es el plan más chico que las conserva.
 *
 * Vive acá y no en la Server Action para poder probarse sin abrir una conexión
 * a Postgres: importar `@/server/actions/movements` arrastra `@/db/client`.
 */
export function highestPaidNumber(installments: { number: number; paid: boolean }[]): number {
  return installments.reduce((max, i) => (i.paid && i.number > max ? i.number : max), 0)
}

/**
 * Invariante de la sección 4 del spec: la suma de las cuotas es igual al total
 * del movimiento. Se valida en cada alta y en cada edición.
 */
export function installmentsSumMatches(totalCents: number, amounts: number[]): boolean {
  if (amounts.length === 0) return false
  return amounts.reduce((a, b) => a + b, 0) === totalCents
}

/**
 * La cuota que paga el botón "Pagar" de la fila (§5.1 del plan v2): la impaga
 * de número más bajo. Por número y no por vencimiento porque el número es el
 * orden del plan, y un vencimiento editado a mano no tiene por qué respetarlo;
 * "Cuota 3/12" tiene que hablar de la tercera. `null` si ya están todas pagas.
 */
export function nextUnpaidInstallment<T extends { number: number; paid: boolean }>(
  installments: T[],
): T | null {
  let next: T | null = null
  for (const i of installments) {
    if (!i.paid && (next === null || i.number < next.number)) next = i
  }
  return next
}

/**
 * "15/12" si cae en el año de `today`, "15/12/2027" si no: la fila es angosta y
 * el año casi siempre es el de hoy, pero un plan largo no puede dejar dudas.
 */
export function formatShortDate(iso: IsoDate, today: IsoDate): string {
  const [year, month, day] = iso.split("-")
  return year === today.slice(0, 4) ? `${day}/${month}` : `${day}/${month}/${year}`
}

/**
 * Lo que muestra la fila sobre su próxima cuota: "Cuota 3/12 · vence en 3
 * días", o "Vence hoy" cuando el plan es de una sola (decir "Cuota 1/1" es
 * ruido). Si ya venció, "venció hace N días" o la fecha corta.
 */
export function describeNextInstallment(
  next: { number: number; dueDate: IsoDate },
  total: number,
  today: IsoDate,
): string {
  const when = formatRelativeDue(next.dueDate, today, formatShortDate(next.dueDate, today))
  if (total <= 1) return when.charAt(0).toUpperCase() + when.slice(1)
  return `Cuota ${next.number}/${total} · ${when}`
}

export type PaidDateResult =
  | { ok: true; paidDate: IsoDate | null }
  | { ok: false; message: string }

/**
 * La fecha que se guarda al marcar o desmarcar una cuota (§5.1 del plan v2).
 *
 * - Desmarcar siempre limpia la fecha: la CHECK de la migración 0009 exige
 *   `paid_date` sólo cuando `paid = true`, y una fecha suelta en una cuota
 *   impaga contaría como plata que se movió.
 * - Marcar sin fecha es "hoy", el caso de un toque.
 * - Una fecha futura se rechaza: con el criterio de lo percibido (§0) una cuota
 *   existe el día que la plata sale, y ese día todavía no llegó. Para lo que
 *   se va a pagar está el vencimiento.
 *
 * `today` entra como parámetro (el servidor pasa `todayInAr()`) para que la
 * regla se pruebe sin reloj.
 */
export function resolvePaidDate(
  paid: boolean,
  requested: IsoDate | undefined,
  today: IsoDate,
): PaidDateResult {
  if (!paid) return { ok: true, paidDate: null }
  if (requested === undefined) return { ok: true, paidDate: today }
  if (!isValidIsoDate(requested)) return { ok: false, message: "Elegí una fecha de pago válida." }
  if (requested > today) {
    return { ok: false, message: "La fecha de pago no puede ser posterior a hoy." }
  }
  return { ok: true, paidDate: requested }
}
