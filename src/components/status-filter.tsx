import Link from "next/link"

import { cn } from "@/lib/utils"
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
        <Link
          key={opt.value}
          href={opt.value === "all" ? basePath : `${basePath}?status=${opt.value}`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            current === opt.value
              ? "bg-accent text-paper"
              : "text-fog hover:text-paper",
          )}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  )
}
