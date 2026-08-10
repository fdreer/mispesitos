import Link from "next/link"

import { InstallmentRows } from "@/components/installment-rows"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { isOverdue, type IsoDate } from "@/lib/dates"
import type { MovementStatus } from "@/lib/movement-status"

type Item = {
  id: string
  number: number
  dueDate: string
  amountCents: number
  description: string
  currency: "ARS" | "USD"
  kind: "income" | "expense"
}

const BASE_PATHS: Record<"income" | "expense", string> = {
  income: "/ingresos",
  expense: "/egresos",
}

export function Upcoming({ items, today }: { items: Item[]; today: IsoDate }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vencimientos</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tenés nada pendiente. Bien ahí.</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => {
              // Estas filas salen todas de cuotas pendientes: nunca "paid".
              // El estado exacto (Task 13) decide a qué lista ya filtrada
              // apunta el enlace de la fila — vencida va a "overdue", el resto
              // a "pending".
              const status: Exclude<MovementStatus, "paid"> = isOverdue(item.dueDate, today)
                ? "overdue"
                : "pending"

              return (
                <li key={item.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {item.description}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({item.kind === "income" ? "a cobrar" : "a pagar"})
                      </span>
                    </p>
                    <Link
                      href={`${BASE_PATHS[item.kind]}?status=${status}`}
                      className="text-muted-foreground shrink-0 text-xs underline"
                    >
                      Ver en {item.kind === "income" ? "ingresos" : "egresos"}
                    </Link>
                  </div>
                  <InstallmentRows
                    rows={[{ ...item, paid: false }]}
                    currency={item.currency}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
