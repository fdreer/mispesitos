import { isOverdue, type IsoDate } from "@/lib/dates"

export type MovementStatus = "paid" | "pending" | "overdue"

type InstallmentLike = { paid: boolean; dueDate: IsoDate }

/**
 * Estado de un movimiento. No hay columna de estado en la base: se deriva
 * siempre desde sus cuotas.
 *
 * - pagado: todas las cuotas están pagadas.
 * - vencido: hay al menos una cuota impaga con vencimiento anterior a hoy.
 * - pendiente: hay cuotas impagas y ninguna vencida.
 */
export function getMovementStatus(
  installments: InstallmentLike[],
  today: IsoDate,
): MovementStatus {
  const pending = installments.filter((i) => !i.paid)
  if (pending.length === 0) return "paid"
  return pending.some((i) => isOverdue(i.dueDate, today)) ? "overdue" : "pending"
}
