import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import type { MovementStatus } from "@/lib/movement-status"

/**
 * Qué color le toca a cada estado. Vive acá y no en cada llamador porque los
 * dos lugares que lo muestran —la columna Estado de la tabla y el desplegable
 * de Estado de los filtros— tienen que coincidir: el sentido del filtro es
 * "mostrame las de este color", y si el desplegable pintara el pendiente de
 * un naranja distinto al de la tabla, el filtro dejaría de leerse así.
 *
 * El TEXTO no se comparte a propósito: la tabla cuenta cuotas ("3
 * pendiente(s)") y el filtro nombra el estado ("Pendiente"). Es lo único que
 * cambia entre los dos, y por eso entra por `children`.
 */
const STATUS_VARIANT: Record<MovementStatus, "destructive" | "warning" | "success"> = {
  overdue: "destructive",
  pending: "warning",
  paid: "success",
}

export function StatusBadge({
  status,
  children,
}: {
  status: MovementStatus
  children: ReactNode
}) {
  return <Badge variant={STATUS_VARIANT[status]}>{children}</Badge>
}
