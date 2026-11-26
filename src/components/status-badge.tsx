import type { ReactNode } from "react"
import { AlertCircle, CheckCircle2, Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { MovementStatus } from "@/lib/movement-status"

const STATUS_VARIANT: Record<MovementStatus, "destructive" | "warning" | "success"> = {
  overdue: "destructive",
  pending: "warning",
  paid: "success",
}

export const STATUS_ICONS: Record<MovementStatus, typeof AlertCircle> = {
  overdue: AlertCircle,
  pending: Clock,
  paid: CheckCircle2,
}

export function StatusBadge({
  status,
  children,
}: {
  status: MovementStatus
  children: ReactNode
}) {
  const Icon = STATUS_ICONS[status]
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      <Icon aria-hidden />
      {children}
    </Badge>
  )
}
