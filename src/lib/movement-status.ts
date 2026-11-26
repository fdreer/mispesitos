import { isOverdue, type IsoDate } from "@/lib/dates"

export type MovementStatus = "paid" | "pending" | "overdue"

type InstallmentLike = { paid: boolean; dueDate: IsoDate }

export type MovementStatusSummary = {
  status: MovementStatus
  pendingCount: number
  overdueCount: number
}

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

export function getMovementStatus(
  installments: InstallmentLike[],
  today: IsoDate,
): MovementStatus {
  return summarizeMovementStatus(installments, today).status
}
