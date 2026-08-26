import Link from "next/link"

import { InstallmentRows } from "@/components/installment-rows"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UpcomingItem } from "@/lib/dashboard-view"
import type { IsoDate } from "@/lib/dates"
import { BASE_PATHS } from "@/lib/movement-routes"

function PendingCard({
  title,
  items,
  today,
}: {
  title: string
  items: UpcomingItem[]
  today: IsoDate
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tenés {title.toLocaleLowerCase()}.</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => {
              return (
                <li key={item.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.description}</p>
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

export function Upcoming({
  payments,
  receivables,
  today,
}: {
  payments: UpcomingItem[]
  receivables: UpcomingItem[]
  today: IsoDate
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PendingCard title="Pagos pendientes" items={payments} today={today} />
      <PendingCard title="Cobros pendientes" items={receivables} today={today} />
    </div>
  )
}
