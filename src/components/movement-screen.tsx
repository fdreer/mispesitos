import { MovementForm } from "@/components/movement-form"
import { MovementList } from "@/components/movement-list"
import { StatusFilter } from "@/components/status-filter"
import { todayInAr } from "@/lib/dates"
import { getMovementStatus, type MovementStatus } from "@/lib/movement-status"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listCategories, listMovements } from "@/server/queries"
import { requireSettings } from "@/server/session"

const TITLES: Record<"income" | "expense", string> = {
  income: "Ingresos",
  expense: "Egresos",
}

const BASE_PATHS: Record<"income" | "expense", string> = {
  income: "/ingresos",
  expense: "/egresos",
}

const STATUS_VALUES: MovementStatus[] = ["pending", "paid", "overdue"]

function parseStatus(raw: string | undefined): MovementStatus | "all" {
  return (STATUS_VALUES as string[]).includes(raw ?? "") ? (raw as MovementStatus) : "all"
}

type Props = {
  kind: "income" | "expense"
  /** El valor crudo de `?status=` de la URL, tal como llega del page.tsx. */
  statusParam: string | undefined
}

/**
 * Cuerpo compartido de /ingresos y /egresos: sólo cambia `kind`. Ver
 * TITLES/BASE_PATHS de acá arriba para el resto de la diferencia.
 */
export async function MovementScreen({ kind, statusParam }: Props) {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [categories, movements, rate] = await Promise.all([
    listCategories(user.id, kind),
    listMovements(user.id, { kind }),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  const statusFilter = parseStatus(statusParam)
  const filtered =
    statusFilter === "all"
      ? movements
      : movements.filter((m) => getMovementStatus(m.installments, today) === statusFilter)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{TITLES[kind]}</h1>

      <MovementForm
        kind={kind}
        categories={categories}
        suggestedRate={rate?.referenceRate ?? null}
      />

      <StatusFilter basePath={BASE_PATHS[kind]} current={statusFilter} />

      <MovementList movements={filtered} categories={categories} today={today} />
    </div>
  )
}
