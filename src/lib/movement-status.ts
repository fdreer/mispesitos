import { isOverdue, type IsoDate } from "@/lib/dates"

export type MovementStatus = "paid" | "pending" | "overdue"

type InstallmentLike = { paid: boolean; dueDate: IsoDate }

export type MovementStatusSummary = {
  status: MovementStatus
  /** Cuántas cuotas siguen impagas. */
  pendingCount: number
  /** Cuántas de esas impagas ya vencieron. Siempre <= pendingCount. */
  overdueCount: number
}

/**
 * Estado de un movimiento y el conteo de cuotas que lo explica. No hay columna
 * de estado en la base: se deriva siempre desde sus cuotas.
 *
 * - pagado: todas las cuotas están pagadas.
 * - vencido: hay al menos una cuota impaga con vencimiento anterior a hoy.
 * - pendiente: hay cuotas impagas y ninguna vencida.
 *
 * Devuelve estado Y conteos en una sola pasada porque hay dos consumidores con
 * necesidades distintas —el filtro de las listas quiere el estado, el badge de
 * cada fila quiere el número— y la regla de "vencido" tiene que ser una sola.
 * La lista los recalculaba a mano: coincidían por casualidad, y el día que la
 * regla cambiara, filtrar por "Vencido" habría mostrado filas con el badge de
 * "pendiente".
 */
export function summarizeMovementStatus(
  installments: InstallmentLike[],
  today: IsoDate,
): MovementStatusSummary {
  const pending = installments.filter((i) => !i.paid)
  const overdueCount = pending.filter((i) => isOverdue(i.dueDate, today)).length

  const status: MovementStatus =
    pending.length === 0 ? "paid" : overdueCount > 0 ? "overdue" : "pending"

  return { status, pendingCount: pending.length, overdueCount }
}

/** El estado solo, para quien no necesita los conteos. */
export function getMovementStatus(
  installments: InstallmentLike[],
  today: IsoDate,
): MovementStatus {
  return summarizeMovementStatus(installments, today).status
}
