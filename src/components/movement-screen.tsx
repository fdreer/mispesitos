import { Suspense } from "react"

import { MovementFormDialog } from "@/components/movement-form-dialog"
import { MovementList } from "@/components/movement-list"
import { StatusFilter } from "@/components/status-filter"
import { todayInAr, type IsoDate } from "@/lib/dates"
import { BASE_PATHS } from "@/lib/movement-routes"
import { getMovementStatus, type MovementStatus } from "@/lib/movement-status"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listCategories, listMovements, type Category } from "@/server/queries"
import { requireSettings } from "@/server/session"

const TITLES: Record<"income" | "expense", string> = {
  income: "Ingresos",
  expense: "Egresos",
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
 * La cotización sugerida sale de dolarapi, que en el peor caso tarda hasta
 * 3s (ver TIMEOUT_MS en @/lib/rate) antes de resolver a null. Separada en su
 * propio componente async y detrás de un Suspense: así esa espera no bloquea
 * el resto de la pantalla, que no depende de ella para pintar.
 */
async function MovementFormDialogWithRate({
  kind,
  categories,
  today,
  ratePreference,
}: {
  kind: "income" | "expense"
  categories: Category[]
  today: IsoDate
  ratePreference: RatePreference
}) {
  const rate = await fetchSuggestedRate(ratePreference)
  return (
    <MovementFormDialog
      kind={kind}
      categories={categories}
      suggestedRate={rate?.referenceRate ?? null}
      today={today}
    />
  )
}

/**
 * Cuerpo compartido de /ingresos y /egresos: sólo cambia `kind`. Ver
 * TITLES/BASE_PATHS de acá arriba para el resto de la diferencia.
 */
export async function MovementScreen({ kind, statusParam }: Props) {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  // Dos consultas a propósito, no una: el desplegable de carga (MovementForm)
  // no debe ofrecer una categoría archivada, pero la lista (MovementList)
  // arma el nombre de la categoría de CADA movimiento —viejo incluido— y una
  // categoría archivada tiene que seguir resolviendo su nombre ahí. Si las dos
  // pantallas compartieran la misma lista "sólo activas", archivar una
  // categoría haría que los movimientos que la usaban pasen a mostrar "—".
  const [activeCategories, allCategories, movements] = await Promise.all([
    listCategories(user.id, kind),
    listCategories(user.id, kind, true),
    listMovements(user.id, { kind }),
  ])

  const statusFilter = parseStatus(statusParam)
  const filtered =
    statusFilter === "all"
      ? movements
      : movements.filter((m) => getMovementStatus(m.installments, today) === statusFilter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-paper">{TITLES[kind]}</h1>
        <Suspense
          fallback={
            <MovementFormDialog
              kind={kind}
              categories={activeCategories}
              suggestedRate={null}
              today={today}
            />
          }
        >
          <MovementFormDialogWithRate
            kind={kind}
            categories={activeCategories}
            today={today}
            ratePreference={settings.preferredRate as RatePreference}
          />
        </Suspense>
      </div>

      <StatusFilter basePath={BASE_PATHS[kind]} current={statusFilter} />

      <MovementList movements={filtered} categories={allCategories} today={today} />
    </div>
  )
}
