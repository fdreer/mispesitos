import Link from "next/link"

import { InstallmentRows } from "@/components/installment-rows"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { IsoDate } from "@/lib/dates"
import { BASE_PATHS } from "@/lib/movement-routes"
import type { MovementStatus } from "@/lib/movement-status"

type Item = {
  id: string
  number: number
  dueDate: string
  amountCents: number
  description: string
  currency: "ARS" | "USD"
  kind: "income" | "expense"
  /** Estado del MOVIMIENTO entero, no de esta cuota: es el que filtra la lista. */
  status: MovementStatus
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
                      href={`${BASE_PATHS[item.kind]}?status=${item.status}`}
                      className="text-muted-foreground shrink-0 text-xs underline"
                    >
                      Ver en {item.kind === "income" ? "ingresos" : "egresos"}
                    </Link>
                  </div>
                  <InstallmentRows
                    rows={[{ ...item, paid: false }]}
                    currency={item.currency}
                    today={today}
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
