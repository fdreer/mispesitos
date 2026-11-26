import Link from "next/link"
import { CreditCard } from "lucide-react"

import { InstallmentRows } from "@/components/installment-rows"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPeriod } from "@/lib/cards"
import {
  isUpcomingStatement,
  type UpcomingPayment,
  type UpcomingStatement,
} from "@/lib/dashboard-view"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { BASE_PATHS } from "@/lib/movement-routes"

function StatementRow({ item }: { item: UpcomingStatement }) {
  const overdue = item.status === "overdue"
  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <CreditCard className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="truncate">
            {item.cardName} · resumen {formatPeriod(item.period)}
          </span>
        </p>
        <Link
          href={`/tarjetas/${item.cardId}?periodo=${item.period}`}
          className="text-muted-foreground shrink-0 text-xs underline"
        >
          Ver resumen
        </Link>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-sm">
        <span className="text-muted-foreground">
          {overdue ? <span className="text-destructive font-medium">Venció </span> : "Vence "}
          {formatIsoForDisplay(item.dueDate)}
        </span>
        <span className="text-right tabular-nums">
          {item.arsCents > 0 && <span className="block">{formatMoney(item.arsCents, "ARS")}</span>}
          {item.usdCents > 0 && <span className="block">{formatMoney(item.usdCents, "USD")}</span>}
        </span>
      </div>
    </li>
  )
}

function PendingCard({
  title,
  items,
  today,
}: {
  title: string
  items: UpcomingPayment[]
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
              if (isUpcomingStatement(item)) return <StatementRow key={item.id} item={item} />
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
                    description={item.description}
                    kind={item.kind}
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
  payments: UpcomingPayment[]
  receivables: UpcomingPayment[]
  today: IsoDate
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PendingCard title="Pagos pendientes" items={payments} today={today} />
      <PendingCard title="Cobros pendientes" items={receivables} today={today} />
    </div>
  )
}
