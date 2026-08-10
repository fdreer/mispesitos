import { Badge } from "@/components/ui/badge"
import { DeleteMovementButton } from "@/components/delete-movement-button"
import { InstallmentRows } from "@/components/installment-rows"
import { isOverdue, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
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
        const pendientes = m.installments.filter((i) => !i.paid)
        const vencidas = pendientes.filter((i) => isOverdue(i.dueDate, today))

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
                  {vencidas.length > 0 && (
                    <Badge variant="destructive">{vencidas.length} vencida(s)</Badge>
                  )}
                  {vencidas.length === 0 && pendientes.length > 0 && (
                    <Badge variant="secondary">{pendientes.length} pendiente(s)</Badge>
                  )}
                  <span className="tabular-nums">
                    {formatMoney(m.amountCents, m.currency as "ARS" | "USD")}
                  </span>
                  <DeleteMovementButton id={m.id} description={m.description} />
                </div>
              </summary>
              <InstallmentRows rows={m.installments} currency={m.currency as "ARS" | "USD"} />
            </details>
          </li>
        )
      })}
    </ul>
  )
}
