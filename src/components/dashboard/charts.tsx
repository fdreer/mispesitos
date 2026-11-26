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

/** El color de una porción: el tono resuelto, o el hash para "Sin categoría". */
const groupColor = (g: { name: string; hue: number | null }) =>
  hueColor(g.hue ?? categoryHue(g.name))

/**
 * La torta de gastos del mes, por categoría PADRE (§2.3 del plan v2), con el
 * desglose por subcategoría en la lista de abajo.
 *
 * Por padre y no por hoja: con subcategorías, la torta por hoja se partía en
 * porciones finitas ("Alquiler", "Expensas", "Servicios"…) y lo que se quiere
 * ver de un vistazo es cuánto se va en Hogar. El detalle está a un clic, en la
 * lista, sin cambiar de pantalla.
 *
 * El color sale de la categoría (el elegido, o el hash del nombre; ver
 * `resolveCategoryHue`), no de su posición en la lista: la misma categoría no
 * cambia de color de un mes a otro con sólo gastar más o menos, y coincide con
 * su badge en la tabla de egresos.
 */
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

/**
 * La leyenda de la torta, que es además el desglose: cada padre con su
 * importe y su porcentaje, y los que tienen subcategorías se despliegan.
 * Sin esta lista, el importe de cada porción sólo se veía pasando el mouse,
 * que en un teléfono no existe.
 */
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
        // Por posición y no por nombre: un nombre con espacios no es un id.
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
