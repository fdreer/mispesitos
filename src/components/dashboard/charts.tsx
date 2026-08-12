"use client"

import type * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { categoryColor } from "@/lib/category-color"
import { formatAxisPesos, formatMoney } from "@/lib/money"

/*
 * La paleta del sistema, repetida acá en hexadecimal a propósito: Recharts
 * recibe colores como strings de JavaScript y no puede leer los tokens de
 * Tailwind. Los valores son los de `globals.css`; si allá cambian, acá también.
 *
 * El lima ácido no está en esta lista y no tiene que estarlo: es el color de la
 * acción principal y de nada más.
 */
const FOG = "#8a8f98"
const SIGNAL_TEAL = "#02b8cc"
const PULSE_GREEN = "#27a644"
const CORAL_RED = "#eb5757"

const toPesos = (cents: number) => cents / 100
const tip = (value: number) => formatMoney(Math.round(value * 100), "ARS")

const AXIS_TICK = { fill: FOG, fontSize: 12 } as const

/**
 * Pasarle `formatter` a ChartTooltipContent le delega toda la fila —punto de
 * color incluido, no sólo el número— así que arma la fila entera: el punto
 * toma `item.payload.fill` (las porciones de la torta) o si no `item.color`
 * (la referencia `var(--color-...)` que ya trae la Line/Bar).
 */
const moneyTooltipFormatter: NonNullable<React.ComponentProps<typeof ChartTooltipContent>["formatter"]> = (
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

// Genérico a propósito: los nombres de categoría son datos del usuario, no se
// conocen en build time. El color de cada porción sale de `fill` en el propio
// dato (ver `CategoryPie` abajo), no de esta config.
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

export function CategoryPie({ data }: { data: { name: string; arsCents: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No cargaste gastos con fecha de este mes.
      </p>
    )
  }

  /*
   * El color sale del NOMBRE de la categoría, no de su posición en esta
   * lista. Antes era `COLORS[index % COLORS.length]` sobre una lista ordenada
   * por importe: la misma categoría cambiaba de color de un mes a otro con
   * sólo gastar más o menos, y no coincidía con el badge que esa categoría
   * tiene en la tabla de egresos. Ahora es el mismo `categoryColor` que usa
   * el badge, así que la porción de la torta y la fila de la tabla se
   * reconocen entre sí.
   */
  const chartData = data.map((d) => ({
    name: d.name,
    value: toPesos(d.arsCents),
    fill: categoryColor(d.name),
  }))

  return (
    <ChartContainer config={PIE_CONFIG} className="aspect-auto h-[220px] w-full">
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={80} stroke="var(--card)">
          {chartData.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
        </Pie>
        <ChartTooltip content={<ChartTooltipContent formatter={moneyTooltipFormatter} />} />
      </PieChart>
    </ChartContainer>
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
