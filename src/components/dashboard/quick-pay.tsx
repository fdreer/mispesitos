"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { es } from "date-fns/locale"
import { CalendarIcon, Check, CheckCircle2, CreditCard } from "lucide-react"

import { PayStatementButton } from "@/components/cards/statement-actions"
import { shortDate } from "@/components/cards/statement-status"
import { markInstallmentPaid } from "@/components/installment-toasts"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatPeriod } from "@/lib/cards"
import {
  isUpcomingStatement,
  type UpcomingItem,
  type UpcomingPayment,
  type UpcomingStatement,
} from "@/lib/dashboard-view"
import { dateToIso, formatRelativeDue, isoToDate, monthKey, type IsoDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

export type StatementPayContext = {
  officialSellRate: number | null
  suggestedBuyRate: number | null
  usdBalanceCents: number
}

type Tab = "pagos" | "cobros"

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const

type Group = { key: string; label: string; items: UpcomingPayment[]; overdue: boolean }

/** Vencidos primero, después este mes y después cada mes siguiente. */
export function groupByDue(items: readonly UpcomingPayment[], today: IsoDate): Group[] {
  const groups = new Map<string, Group>()
  const thisMonth = monthKey(today)
  for (const item of items) {
    const overdue = item.dueDate < today
    const month = monthKey(item.dueDate)
    const key = overdue ? "vencidos" : month
    const label = overdue
      ? "Vencidos"
      : month === thisMonth
        ? "Este mes"
        : (MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month)
    const group = groups.get(key) ?? { key, label, items: [], overdue }
    group.items.push(item)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) =>
    a.overdue ? -1 : b.overdue ? 1 : a.key < b.key ? -1 : 1,
  )
}

function groupTotals(items: readonly UpcomingPayment[]) {
  let ars = 0
  let usd = 0
  for (const item of items) {
    if (isUpcomingStatement(item)) {
      ars += item.arsCents
      usd += item.usdCents
    } else if (item.currency === "USD") usd += item.amountCents
    else ars += item.amountCents
  }
  return { ars, usd }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Lo pendiente de este mes y el próximo, para tachar de un toque. Una cuota
 * se marca pagada hoy con el círculo (el toast permite deshacer) o en otra
 * fecha con el calendario. Un resumen de tarjeta no se paga cuota por cuota:
 * abre el mismo diálogo de pago que en /tarjetas.
 */
export function QuickPay({
  payments,
  receivables,
  today,
  statementContext,
}: {
  payments: UpcomingPayment[]
  receivables: UpcomingItem[]
  today: IsoDate
  statementContext: StatementPayContext
}) {
  const [tab, setTab] = useState<Tab>("pagos")
  const items = tab === "pagos" ? payments : receivables
  const groups = groupByDue(items, today)

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Segmented
        label="Pendientes"
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: "pagos", label: `A pagar · ${payments.length}` },
          { value: "cobros", label: `A cobrar · ${receivables.length}` },
        ]}
      />

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="size-6 text-pulse-green" aria-hidden />
          <p className="text-sm text-paper">Estás al día</p>
          <p className="text-muted-foreground text-xs">
            No hay {tab === "pagos" ? "pagos" : "cobros"} pendientes para este mes ni el próximo.
          </p>
        </div>
      ) : (
        <div className="-mx-1 space-y-4 overflow-y-auto px-1 lg:max-h-[560px]">
          {groups.map((group) => {
            const totals = groupTotals(group.items)
            return (
              <section key={group.key} aria-label={group.label}>
                <header className="mb-1 flex items-baseline justify-between gap-2 px-1 text-xs">
                  <h3
                    className={cn(
                      "font-medium",
                      group.overdue ? "text-coral-red" : "text-muted-foreground",
                    )}
                  >
                    {group.label} · {group.items.length}
                  </h3>
                  <span className="text-muted-foreground tabular-nums">
                    {totals.ars > 0 && formatMoney(totals.ars, "ARS", 0)}
                    {totals.ars > 0 && totals.usd > 0 && " + "}
                    {totals.usd > 0 && formatMoney(totals.usd, "USD")}
                  </span>
                </header>
                <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-lg bg-white/[0.02]">
                  {group.items.map((item) =>
                    isUpcomingStatement(item) ? (
                      <StatementRow
                        key={item.id}
                        item={item}
                        today={today}
                        context={statementContext}
                      />
                    ) : (
                      <InstallmentRow key={item.id} item={item} today={today} />
                    ),
                  )}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <Link
        href={tab === "pagos" ? "/egresos?status=pending" : "/ingresos?status=pending"}
        className="text-muted-foreground self-start text-xs underline underline-offset-2 hover:text-foreground"
      >
        Ver todos los {tab === "pagos" ? "egresos" : "ingresos"} pendientes
      </Link>
    </div>
  )
}

function DueLine({ dueDate, today }: { dueDate: IsoDate; today: IsoDate }) {
  const overdue = dueDate < today
  return (
    <span className={cn(overdue && "text-coral-red")}>
      {capitalize(formatRelativeDue(dueDate, today, shortDate(dueDate)))}
    </span>
  )
}

function InstallmentRow({ item, today }: { item: UpcomingItem; today: IsoDate }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateOpen, setDateOpen] = useState(false)
  const isIncome = item.kind === "income"
  const verb = isIncome ? "cobrada" : "pagada"

  function mark(date?: IsoDate) {
    setError(null)
    setDone(true)
    startTransition(async () => {
      const result = await markInstallmentPaid({
        id: item.id,
        kind: item.kind,
        description: `${item.description} · cuota ${item.number}`,
        paidDate: date,
      })
      if (!result.ok) {
        setDone(false)
        setError(result.message)
      }
    })
  }

  return (
    <li className="group flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={() => mark()}
        disabled={pending || done}
        aria-label={`Marcar ${verb} hoy: ${item.description}, cuota ${item.number}`}
        title={`Marcar ${verb} hoy`}
        className={cn(
          "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default",
          done
            ? "border-pulse-green bg-pulse-green text-void"
            : "border-smoke text-transparent hover:border-pulse-green hover:text-pulse-green",
        )}
      >
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </button>

      <div className={cn("min-w-0 flex-1 transition-opacity", done && "opacity-50")}>
        <p className={cn("truncate text-sm text-paper", done && "line-through")}>
          {item.description}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          Cuota {item.number} · <DueLine dueDate={item.dueDate} today={today} />
        </p>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <span
        className={cn(
          "shrink-0 text-sm tabular-nums",
          done ? "text-muted-foreground" : isIncome ? "text-pulse-green" : "text-foreground",
        )}
      >
        {formatMoney(item.amountCents, item.currency, item.currency === "USD" ? 2 : 0)}
      </span>

      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={pending || done}
            className="text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:data-[state=open]:opacity-100"
            aria-label={`Elegir fecha de ${isIncome ? "cobro" : "pago"}: ${item.description}, cuota ${item.number}`}
          >
            <CalendarIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <p className="text-muted-foreground px-3 pt-3 text-xs">
            ¿Qué día {isIncome ? "la cobraste" : "la pagaste"}?
          </p>
          <Calendar
            mode="single"
            locale={es}
            defaultMonth={isoToDate(today)}
            disabled={{ after: isoToDate(today) }}
            onSelect={(d) => {
              if (!d) return
              setDateOpen(false)
              mark(dateToIso(d))
            }}
          />
        </PopoverContent>
      </Popover>
    </li>
  )
}

function StatementRow({
  item,
  today,
  context,
}: {
  item: UpcomingStatement
  today: IsoDate
  context: StatementPayContext
}) {
  const href = `/tarjetas/${item.cardId}?periodo=${item.period}`
  const payable = item.closingDate !== null && item.closingDate <= today
  const onlyUsd = item.arsCents === 0 && item.usdCents > 0

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        <CreditCard className="size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-sm text-paper hover:underline">
          {item.cardName} · resumen {formatPeriod(item.period)}
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          <DueLine dueDate={item.dueDate} today={today} />
          {item.closingDate !== null && !payable && ` · cierra ${shortDate(item.closingDate)}`}
        </p>
      </div>

      <span className="shrink-0 text-right text-sm tabular-nums">
        <span className="block">
          {onlyUsd ? formatMoney(item.usdCents, "USD") : formatMoney(item.arsCents, "ARS", 0)}
        </span>
        {!onlyUsd && item.usdCents > 0 && (
          <span className="text-muted-foreground block text-xs">
            + {formatMoney(item.usdCents, "USD")}
          </span>
        )}
      </span>

      {payable && item.closingDate !== null ? (
        <PayStatementButton
          size="sm"
          label="Pagar"
          statement={{
            id: item.id,
            cardId: item.cardId,
            cardName: item.cardName,
            period: item.period,
            closingDate: item.closingDate,
            dueDate: item.dueDate,
            paidDate: null,
            arsCents: item.arsCents,
            usdCents: item.usdCents,
            count: item.count,
          }}
          today={today}
          officialSellRate={context.officialSellRate}
          suggestedBuyRate={context.suggestedBuyRate}
          usdBalanceCents={context.usdBalanceCents}
        />
      ) : (
        <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
          <Link href={href}>Ver</Link>
        </Button>
      )}
    </li>
  )
}
