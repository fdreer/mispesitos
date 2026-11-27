"use client"

import type { ComponentProps } from "react"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatAxisPesos, formatMoney, type Currency } from "@/lib/money"
import type { CashflowRow } from "@/lib/reports-cashflow"

const FOG = "#8a8f98"
const SIGNAL_TEAL = "#02b8cc"
const PULSE_GREEN = "#27a644"
const CORAL_RED = "#eb5757"

const toUnits = (cents: number) => cents / 100
const AXIS_TICK = { fill: FOG, fontSize: 12 } as const

type TooltipFormatter = NonNullable<ComponentProps<typeof ChartTooltipContent>["formatter"]>

function makeMoneyFormatter(currency: Currency): TooltipFormatter {
  const formatter: TooltipFormatter = function MoneyTooltipRow(value, name, item) {
    const color = (item.payload as { fill?: string } | undefined)?.fill ?? item.color
    const cents = Math.round(Number(value) * 100)
    const digits: 0 | 2 = cents % 100 === 0 ? 0 : 2
    return (
      <>
        <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-muted-foreground">{name}</span>
          <span className="font-mono font-medium text-foreground tabular-nums">
            {formatMoney(cents, currency, digits)}
          </span>
        </div>
      </>
    )
  }
  return formatter
}

const PNL_CONFIG = {
  Ingresos: { label: "Ingresos", color: PULSE_GREEN },
  Egresos: { label: "Egresos", color: CORAL_RED },
  Neto: { label: "Resultado neto", color: SIGNAL_TEAL },
} satisfies ChartConfig

const CASHFLOW_CONFIG = {
  neto: { label: "Neto", color: PULSE_GREEN },
  saldoProyectado: { label: "Saldo proyectado", color: SIGNAL_TEAL },
} satisfies ChartConfig

export function PnlChart({
  data,
  currency,
}: {
  data: { month: string; label: string; incomeCents: number; expenseCents: number; netCents: number }[]
  currency: Currency
}) {
  const formatter = makeMoneyFormatter(currency)
  const chartData = data.map((d) => ({
    label: d.label,
    Ingresos: toUnits(d.incomeCents),
    Egresos: toUnits(d.expenseCents),
    Neto: toUnits(d.netCents),
  }))

  return (
    <ChartContainer config={PNL_CONFIG} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={chartData}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={AXIS_TICK} />
        <YAxis
          width={80}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickFormatter={formatAxisPesos}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="Ingresos" fill="var(--color-Ingresos)" radius={4} />
        <Bar dataKey="Egresos" fill="var(--color-Egresos)" radius={4} />
        <Line
          type="monotone"
          dataKey="Neto"
          stroke="var(--color-Neto)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ChartContainer>
  )
}

export function CashflowChart({
  rows,
}: {
  rows: CashflowRow[]
}) {
  const formatter = makeMoneyFormatter("ARS")

  const chartData = rows.map((r) => ({
    label: r.label,
    neto: toUnits(r.netCents),
    saldoProyectado: toUnits(r.closingCents),
  }))

  return (
    <ChartContainer config={CASHFLOW_CONFIG} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={chartData}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={AXIS_TICK} />
        <YAxis
          width={80}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickFormatter={formatAxisPesos}
        />
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
        <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="neto" name="neto" radius={4}>
          {chartData.map((entry) => (
            <Cell
              key={entry.label}
              fill={entry.neto >= 0 ? PULSE_GREEN : CORAL_RED}
              fillOpacity={0.65}
            />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="saldoProyectado"
          stroke="var(--color-saldoProyectado)"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
