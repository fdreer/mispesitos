import Link from "next/link"

import { Button } from "@/components/ui/button"
import type { MovementStatus } from "@/lib/movement-status"

const OPTIONS: { value: MovementStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendiente" },
  { value: "paid", label: "Pagado" },
  { value: "overdue", label: "Vencido" },
]

type Props = {
  /** Ruta de la pantalla actual ("/ingresos" o "/egresos"), sin query. */
  basePath: string
  current: MovementStatus | "all"
}

/**
 * El filtro elegido viaja en la URL (?status=...) para sobrevivir a una
 * recarga y para que el dashboard (Task 17) pueda enlazar directo a la
 * lista ya filtrada.
 */
export function StatusFilter({ basePath, current }: Props) {
  return (
    <div className="flex gap-1">
      {OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          asChild
          type="button"
          size="sm"
          variant={current === opt.value ? "secondary" : "ghost"}
        >
          <Link href={opt.value === "all" ? basePath : `${basePath}?status=${opt.value}`}>
            {opt.label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
