import type { ReactNode } from "react"
import { AlertCircle, CheckCircle2, Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { MovementStatus } from "@/lib/movement-status"

/**
 * Qué color e icono le toca a cada estado. Vive acá para que la tabla y las
 * pastillas compartan la misma referencia visual: nunca sólo el color (§5.3
 * del plan v2).
 */
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
