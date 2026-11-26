"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Segmented } from "@/components/segmented"
import {
  buildReportHref,
  type CashflowGranularity,
  type ReportCurrency,
  type ReportQuery,
} from "@/lib/report-query"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "ingresos-gastos" as const, label: "Ingresos vs Gastos" },
  { id: "flujo" as const, label: "Flujo de caja" },
]

const CURRENCY_OPTIONS: { value: ReportCurrency; label: string }[] = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
  { value: "todo", label: "Todo en pesos" },
]

const GRANULARITY_OPTIONS: { value: CashflowGranularity; label: string }[] = [
  { value: "mensual", label: "Mensual" },
  { value: "semanal", label: "Semanal (3 meses)" },
]

export function ReportControls({ query }: { query: ReportQuery }) {
  const { push } = useRouter()
  const [pending, startTransition] = useTransition()

  function navigate(href: string) {
    startTransition(() => {
      push(href)
    })
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 transition-opacity lg:flex-row lg:items-center lg:justify-between",
        pending && "opacity-60",
      )}
      aria-busy={pending}
    >
      <nav aria-label="Tipo de informe" className="flex flex-wrap items-center gap-1.5">
        {TABS.map((tab) => {
          const active = query.tab === tab.id
          return (
            <Link
              key={tab.id}
              href={buildReportHref(query, { tab: tab.id })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors",
                active
                  ? "border-mist/40 bg-accent text-paper"
                  : "border-border bg-white/[0.02] text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="w-full sm:w-72">
          <Segmented
            label="Moneda del informe"
            size="sm"
            value={query.currency}
            onChange={(currency) => navigate(buildReportHref(query, { currency }))}
            options={CURRENCY_OPTIONS}
          />
        </div>

        {query.tab === "flujo" && (
          <div className="w-full sm:w-64">
            <Segmented
              label="Granularidad"
              size="sm"
              value={query.granularity}
              onChange={(granularity) => navigate(buildReportHref(query, { granularity }))}
              options={GRANULARITY_OPTIONS}
            />
          </div>
        )}
      </div>
    </div>
  )
}
