import { Badge } from "@/components/ui/badge"
import { DeleteMovementButton } from "@/components/delete-movement-button"
import { InstallmentRows } from "@/components/installment-rows"
import { type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { assertCurrency } from "@/lib/movement-asserts"
import { summarizeMovementStatus } from "@/lib/movement-status"
import type { Category, MovementWithInstallments } from "@/server/queries"

type Props = {
  movements: MovementWithInstallments[]
  categories: Category[]
  today: IsoDate
}

export function MovementList({ movements, categories, today }: Props) {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  if (movements.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Todavía no cargaste nada acá.
      </p>
    )
  }

  return (
    <ul className="divide-y">
      {movements.map((m) => {
        // El mismo cálculo que usa el filtro de estado de esta pantalla: el
        // badge y el filtro no pueden discrepar sobre qué está vencido.
        const { status, pendingCount, overdueCount } = summarizeMovementStatus(
          m.installments,
          today,
        )

        // Una sola vez por movimiento, y con assert en vez de `as`: el importe
        // del movimiento y el de sus cuotas se muestran en la MISMA moneda, y
        // con dos `as` sueltos nada lo garantizaba.
        const currency = assertCurrency(m.currency)

        return (
          <li key={m.id} className="py-3">
            <details>
              <summary className="flex cursor-pointer items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.description}</p>
                  <p className="text-muted-foreground text-sm">
                    {m.date} · {m.categoryId ? categoryName.get(m.categoryId) : "—"}
                    {m.installments.length > 1 && ` · ${m.installments.length} cuotas`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {status === "overdue" && (
                    <Badge variant="destructive">{overdueCount} vencida(s)</Badge>
                  )}
                  {status === "pending" && (
                    <Badge variant="secondary">{pendingCount} pendiente(s)</Badge>
                  )}
                  <span className="tabular-nums">
                    {formatMoney(m.amountCents, currency)}
                  </span>
                </div>
              </summary>
              <InstallmentRows rows={m.installments} currency={currency} />
              {/* El botón va fuera del <summary>: un <summary> no puede tener
                  descendientes interactivos, y anidarlo obligaba a un
                  preventDefault para que el click no togglee el detalle. */}
              <div className="mt-2 flex justify-end">
                <DeleteMovementButton id={m.id} description={m.description} />
              </div>
            </details>
          </li>
        )
      })}
    </ul>
  )
}
