"use client"

import { useState, type ComponentProps } from "react"
import { ChevronRight } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { categoryHue, hueColor } from "@/lib/category-color"
import type { SpendGroup } from "@/lib/category-tree"
import { formatAxisPesos, formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

const FOG = "#8a8f98"
const SIGNAL_TEAL = "#02b8cc"
const PULSE_GREEN = "#27a644"
const CORAL_RED = "#eb5757"

const toPesos = (cents: number) => cents / 100
const tip = (value: number) => formatMoney(Math.round(value * 100), "ARS")

const AXIS_TICK = { fill: FOG, fontSize: 12 } as const

const moneyTooltipFormatter: NonNullable<ComponentProps<typeof ChartTooltipContent>["formatter"]> = (
  value,
  name,
  item,
) => {
  const color = (item.payload as { fill?: string } | undefined)?.fill ?? item.color
  return (
    <>
      <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      <div className="flex flex-1 items-center justify-between leading-none">
        <span className="text-muted-foreground">{name}</span>
        <span className="font-mono font-medium text-foreground tabular-nums">{tip(Number(value))}</span>
      </div>
    </>
  )
}

const PROJECTION_CONFIG = {
  saldo: { label: "Saldo", color: SIGNAL_TEAL },
} satisfies ChartConfig

const MONTHLY_CONFIG = {
  Ingresos: { label: "Ingresos", color: PULSE_GREEN },
  Egresos: { label: "Egresos", color: CORAL_RED },
} satisfies ChartConfig

const PIE_CONFIG = { value: { label: "Importe" } } satisfies ChartConfig

export function ProjectionChart({
  data,
}: {
  data: { month: string; arsCents: number }[]
}) {
  return (
    <ChartContainer config={PROJECTION_CONFIG} className="aspect-auto h-[220px] w-full">
      <LineChart data={data.map((d) => ({ month: d.month, saldo: toPesos(d.arsCents) }))}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={AXIS_TICK} />
        <YAxis
          width={80}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickFormatter={formatAxisPesos}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={moneyTooltipFormatter} />} />
        <Line
          type="monotone"
          dataKey="saldo"
          stroke="var(--color-saldo)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

const groupColor = (g: { name: string; hue: number | null }) =>
  hueColor(g.hue ?? categoryHue(g.name))

export function CategoryPie({ data }: { data: SpendGroup[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Todavía no pagaste nada este mes.
      </p>
    )
  }

  const chartData = data.map((d) => ({
    name: d.name,
    value: toPesos(d.arsCents),
    fill: groupColor(d),
  }))
  const total = data.reduce((acc, d) => acc + d.arsCents, 0)

  return (
    <div className="space-y-3">
      <ChartContainer config={PIE_CONFIG} className="aspect-auto h-[200px] w-full">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={80} stroke="var(--card)">
            {chartData.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent formatter={moneyTooltipFormatter} />} />
        </PieChart>
      </ChartContainer>
      <CategoryBreakdown data={data} total={total} />
    </div>
  )
}

function CategoryBreakdown({ data, total }: { data: SpendGroup[]; total: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const percent = (cents: number) => (total > 0 ? Math.round((cents / total) * 100) : 0)

  return (
    <ul aria-label="Gastos por categoría" className="divide-y divide-border text-sm">
      {data.map((group, index) => {
        const expandable = group.children.length > 0
        const isOpen = open.has(group.name)
        const detailsId = `desglose-${index}`
        const row = (
          <>
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: groupColor(group) }}
            />
            <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
            <span className="text-muted-foreground tabular-nums">{percent(group.arsCents)}%</span>
            <span className="w-28 text-right font-mono tabular-nums">
              {formatMoney(group.arsCents, "ARS")}
            </span>
          </>
        )
        return (
          <li key={group.name}>
            {expandable ? (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={detailsId}
                onClick={() => toggle(group.name)}
                className="flex min-h-10 w-full items-center gap-2 rounded-sm hover:bg-accent/50"
              >
                <ChevronRight
                  aria-hidden
                  className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                />
                {row}
              </button>
            ) : (
              <div className="flex min-h-10 items-center gap-2">
                <span aria-hidden className="size-4 shrink-0" />
                {row}
              </div>
            )}
            {expandable && isOpen && (
              <ul id={detailsId} className="pb-2 pl-10">
                {group.children.map((child) => (
                  <li key={child.name} className="flex min-h-8 items-center gap-2 text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">{child.name}</span>
                    <span className="tabular-nums">{percent(child.arsCents)}%</span>
                    <span className="w-28 text-right font-mono tabular-nums">
                      {formatMoney(child.arsCents, "ARS")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function MonthlyBars({
  data,
}: {
  data: { month: string; incomeArsCents: number; expenseArsCents: number }[]
}) {
  return (
    <ChartContainer config={MONTHLY_CONFIG} className="aspect-auto h-[220px] w-full">
      <BarChart
        data={data.map((d) => ({
          month: d.month,
          Ingresos: toPesos(d.incomeArsCents),
          Egresos: toPesos(d.expenseArsCents),
        }))}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={AXIS_TICK} />
        <YAxis
          width={80}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickFormatter={formatAxisPesos}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={moneyTooltipFormatter} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {/* Acá el verde y el rojo son datos, no cuerpo de texto: la regla de
            "los importes van en gris" no aplica a una serie de un gráfico. */}
        <Bar dataKey="Ingresos" fill="var(--color-Ingresos)" radius={4} />
        <Bar dataKey="Egresos" fill="var(--color-Egresos)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
