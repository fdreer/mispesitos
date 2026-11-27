import Link from "next/link"
import { AlertCircle, CheckCircle2, Clock } from "lucide-react"

import { LinkPending } from "@/components/link-pending"
import { formatMoney } from "@/lib/money"
import type {
  CurrencyBucket,
  FilterTotals,
  MovementSort,
  StatusCounts,
} from "@/lib/movement-list-view"
import { buildMovementHref, type MovementQuery } from "@/lib/movement-query"
import type { MovementStatus } from "@/lib/movement-status"
import { cn } from "@/lib/utils"

type StatusOption = {
  value: MovementStatus | "all"
  label: string
  count?: number
  icon?: typeof AlertCircle
  iconClass?: string
}

export function MovementStatusPills({
  basePath,
  query,
  defaultSort,
  counts,
}: {
  basePath: string
  query: MovementQuery
  defaultSort: MovementSort
  counts: StatusCounts
}) {
  const options: StatusOption[] = [
    { value: "all", label: "Todos" },
    {
      value: "overdue",
      label: "Vencidos",
      count: counts.overdue,
      icon: AlertCircle,
      iconClass: "text-coral-red",
    },
    {
      value: "pending",
      label: "Pendientes",
      count: counts.pending,
      icon: Clock,
      iconClass: "text-ember-orange",
    },
    {
      value: "paid",
      label: "Pagados",
      icon: CheckCircle2,
      iconClass: "text-pulse-green",
    },
  ]

  return (
    <nav
      aria-label="Estado"
      className="inline-flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5 [scrollbar-width:none]"
    >
      {options.map((opt) => {
        const active = query.status === opt.value
        const Icon = opt.icon
        return (
          <Link
            key={opt.value}
            href={buildMovementHref(basePath, query, { status: opt.value }, defaultSort)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-white/[0.08] text-paper shadow-sm"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            <LinkPending className="inline-flex items-center gap-1.5">
              {Icon && <Icon className={cn("size-3.5", opt.iconClass)} aria-hidden />}
              <span>
                {opt.label}
                {opt.count !== undefined ? ` (${opt.count})` : ""}
              </span>
            </LinkPending>
          </Link>
        )
      })}
    </nav>
  )
}

function formatBucket(bucket: CurrencyBucket): string {
  if (bucket.arsCents === 0 && bucket.usdCents === 0) return formatMoney(0, "ARS")
  return [
    bucket.arsCents > 0 ? formatMoney(bucket.arsCents, "ARS") : null,
    bucket.usdCents > 0 ? formatMoney(bucket.usdCents, "USD") : null,
  ]
    .filter(Boolean)
    .join(" + ")
}

/**
 * Totales del filtro arriba de la lista (§4: "Pendiente: $X · Vencido: $Y ·
 * Pagado: $Z"). Muestra cada estado con su icono además del color.
 */
export function MovementTotalsBar({ totals }: { totals: FilterTotals }) {
  const items = [
    {
      key: "pending",
      label: "Pendiente",
      value: formatBucket(totals.pending),
      Icon: Clock,
      color: "text-ember-orange",
    },
    {
      key: "overdue",
      label: "Vencido",
      value: formatBucket(totals.overdue),
      Icon: AlertCircle,
      color: "text-coral-red",
    },
    {
      key: "paid",
      label: "Pagado",
      value: formatBucket(totals.paid),
      Icon: CheckCircle2,
      color: "text-pulse-green",
    },
  ] as const

  return (
    <div
      aria-label="Totales del filtro"
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
    >
      {items.map(({ key, label, value, Icon, color }) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <Icon className={cn("size-3.5", color)} aria-hidden />
          <span>{label}:</span>
          <span className="font-medium text-foreground tabular-nums">{value}</span>
        </span>
      ))}
    </div>
  )
}
