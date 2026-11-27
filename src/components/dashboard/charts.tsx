"use client"

import { useId, useMemo, useState, type ComponentProps } from "react"
import { ChevronRight } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"

import { Segmented } from "@/components/segmented"
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
import type { MonthlyBarPoint } from "@/lib/dashboard-view"
import { formatAxisPesos, formatMoney, type Currency } from "@/lib/money"
import { cn } from "@/lib/utils"

const FOG = "#8a8f98"
const PULSE_GREEN = "#27a644"
const CORAL_RED = "#eb5757"

const toUnits = (cents: number) => cents / 100

const AXIS_TICK = { fill: FOG, fontSize: 12 } as const

type TooltipFormatter = NonNullable<ComponentProps<typeof ChartTooltipContent>["formatter"]>

function makeMoneyTooltipFormatter(currency: Currency): TooltipFormatter {
  return function MoneyTooltip(value, name, item) {
    const color = (item.payload as { fill?: string } | undefined)?.fill ?? item.color
    return (
      <>
        <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
        <div className="flex flex-1 items-center justify-between leading-none">
          <span className="text-muted-foreground">{name}</span>
          <span className="font-mono font-medium text-foreground tabular-nums">
            {formatMoney(Math.round(Number(value) * 100), currency)}
          </span>
        </div>
      </>
    )
  }
}

const TOOLTIP_FORMATTER_ARS = makeMoneyTooltipFormatter("ARS")
const TOOLTIP_FORMATTER_USD = makeMoneyTooltipFormatter("USD")

const MONTHLY_CONFIG = {
  Ingresos: { label: "Ingresos", color: PULSE_GREEN },
  Egresos: { label: "Egresos", color: CORAL_RED },
} satisfies ChartConfig

const PIE_CONFIG = { value: { label: "Importe" } } satisfies ChartConfig

const groupColor = (g: { name: string; hue: number | null }) =>
  hueColor(g.hue ?? categoryHue(g.name))

export function CategoryPie({
  data,
}: {
  data: { ars: SpendGroup[]; usd: SpendGroup[] }
}) {
  const [currency, setCurrency] = useState<Currency>("ARS")
  const active = currency === "USD" ? data.usd : data.ars
  const hasAny = data.ars.length > 0 || data.usd.length > 0

  const chartData = useMemo(
    () =>
      active.map((d) => ({
        name: d.name,
        value: toUnits(d.arsCents),
        fill: groupColor(d),
      })),
    [active],
  )
  const total = useMemo(() => active.reduce((acc, d) => acc + d.arsCents, 0), [active])

  if (!hasAny) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Todavía no pagaste nada este mes.
      </p>
    )
  }

  const formatter = currency === "USD" ? TOOLTIP_FORMATTER_USD : TOOLTIP_FORMATTER_ARS

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Segmented
          label="Moneda de gastos por categoría"
          size="sm"
          value={currency}
          onChange={setCurrency}
          options={[
            { value: "ARS", label: "$" },
            { value: "USD", label: "US$" },
          ]}
        />
      </div>
      {active.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Sin gastos pagados en {currency === "USD" ? "dólares" : "pesos"} este mes.
        </p>
      ) : (
        <>
          <ChartContainer config={PIE_CONFIG} className="aspect-auto h-[200px] w-full">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={80} stroke="var(--card)">
                {chartData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
            </PieChart>
          </ChartContainer>
          <CategoryBreakdown data={active} total={total} currency={currency} />
        </>
      )}
    </div>
  )
}

function CategoryBreakdown({
  data,
  total,
  currency,
}: {
  data: SpendGroup[]
  total: number
  currency: Currency
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const percent = (cents: number) => (total > 0 ? Math.round((cents / total) * 100) : 0)
  const idPrefix = useId()

  return (
    <ul aria-label="Gastos por categoría" className="divide-y divide-border text-sm">
      {data.map((group, index) => {
        const expandable = group.children.length > 0
        const isOpen = open.has(group.name)
        const detailsId = `${idPrefix}-desglose-${index}`
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
              {formatMoney(group.arsCents, currency)}
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
                      {formatMoney(child.arsCents, currency)}
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
  data: { ars: MonthlyBarPoint[]; usd: MonthlyBarPoint[] }
}) {
  const [currency, setCurrency] = useState<Currency>("ARS")
  const active = currency === "USD" ? data.usd : data.ars
  const formatter = currency === "USD" ? TOOLTIP_FORMATTER_USD : TOOLTIP_FORMATTER_ARS
  const chartData = useMemo(
    () =>
      active.map((d) => ({
        month: d.month,
        Ingresos: toUnits(d.incomeCents),
        Egresos: toUnits(d.expenseCents),
      })),
    [active],
  )

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Segmented
          label="Moneda de ingresos y gastos"
          size="sm"
          value={currency}
          onChange={setCurrency}
          options={[
            { value: "ARS", label: "$" },
            { value: "USD", label: "US$" },
          ]}
        />
      </div>
      <ChartContainer config={MONTHLY_CONFIG} className="aspect-auto h-[220px] w-full">
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={AXIS_TICK} />
          <YAxis
            width={80}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={formatAxisPesos}
          />
          <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="Ingresos" fill="var(--color-Ingresos)" radius={4} />
          <Bar dataKey="Egresos" fill="var(--color-Egresos)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
