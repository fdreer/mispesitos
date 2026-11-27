"use client"

import { memo, useId, useMemo } from "react"
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  AXIS_TICK,
  CORAL_RED,
  PULSE_GREEN,
  SIGNAL_TEAL,
  TOOLTIP_FORMATTER_ARS_COMPACT as TOOLTIP_FORMATTER_ARS,
  TOOLTIP_FORMATTER_USD_COMPACT as TOOLTIP_FORMATTER_USD,
  toUnits,
} from "@/components/charts/chart-helpers"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatAxisPesos, type Currency } from "@/lib/money"
import type { CashflowRow } from "@/lib/reports-cashflow"

const PNL_CONFIG = {
  Ingresos: { label: "Ingresos", color: PULSE_GREEN },
  Egresos: { label: "Egresos", color: CORAL_RED },
  Neto: { label: "Resultado neto", color: SIGNAL_TEAL },
} satisfies ChartConfig

const CASHFLOW_CONFIG = {
  entradas: { label: "Entra", color: PULSE_GREEN },
  salidas: { label: "Sale", color: CORAL_RED },
  saldo: { label: "Saldo proyectado", color: SIGNAL_TEAL },
} satisfies ChartConfig

export const PnlChart = memo(function PnlChart({
  data,
  currency,
}: {
  data: { month: string; label: string; incomeCents: number; expenseCents: number; netCents: number }[]
  currency: Currency
}) {
  const formatter = currency === "USD" ? TOOLTIP_FORMATTER_USD : TOOLTIP_FORMATTER_ARS
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        label: d.label,
        Ingresos: toUnits(d.incomeCents),
        Egresos: toUnits(d.expenseCents),
        Neto: toUnits(d.netCents),
      })),
    [data],
  )

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
})

/**
 * El flujo de fondos en un solo gráfico: lo que entra y lo que sale de cada
 * período en barras (eje derecho) y el saldo que va quedando como área (eje
 * izquierdo). Van en ejes distintos porque el saldo suele ser un orden de
 * magnitud mayor que lo que se mueve en un mes, y en un eje común las barras
 * quedarían chatas e ilegibles.
 */
export const CashflowChart = memo(function CashflowChart({
  rows,
  height = 260,
}: {
  rows: Pick<CashflowRow, "key" | "label" | "inflowsCents" | "outflowsCents" | "closingCents">[]
  height?: number
}) {
  const formatter = TOOLTIP_FORMATTER_ARS
  const goesNegative = useMemo(() => rows.some((r) => r.closingCents < 0), [rows])
  // Único por instancia: dos gráficos en la misma página compartirían el
  // degradado. Sólo caracteres seguros adentro de `url(#…)`.
  const instanceId = useId()
  const fillId = `saldo-fill-${instanceId.replace(/[^\w-]/g, "")}`

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        label: r.label,
        entradas: toUnits(r.inflowsCents),
        salidas: toUnits(r.outflowsCents),
        saldo: toUnits(r.closingCents),
      })),
    [rows],
  )

  return (
    <ChartContainer config={CASHFLOW_CONFIG} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={chartData} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SIGNAL_TEAL} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SIGNAL_TEAL} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={AXIS_TICK} />
        <YAxis
          yAxisId="saldo"
          width={72}
          tickLine={false}
          axisLine={false}
          tick={{ ...AXIS_TICK, fill: SIGNAL_TEAL }}
          tickFormatter={formatAxisPesos}
        />
        <YAxis
          yAxisId="flujo"
          orientation="right"
          width={64}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickFormatter={formatAxisPesos}
        />
        {goesNegative && (
          <ReferenceLine yAxisId="saldo" y={0} stroke={CORAL_RED} strokeDasharray="3 3" />
        )}
        <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          yAxisId="saldo"
          type="monotone"
          dataKey="saldo"
          stroke="var(--color-saldo)"
          strokeWidth={2}
          fill={`url(#${fillId})`}
          dot={{ r: 2.5, fill: SIGNAL_TEAL, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
        <Bar
          yAxisId="flujo"
          dataKey="entradas"
          fill="var(--color-entradas)"
          fillOpacity={0.8}
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
        />
        <Bar
          yAxisId="flujo"
          dataKey="salidas"
          fill="var(--color-salidas)"
          fillOpacity={0.8}
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
        />
      </ComposedChart>
    </ChartContainer>
  )
})
