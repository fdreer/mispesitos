"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatMoney } from "@/lib/money"

/*
 * La paleta del sistema, repetida acá en hexadecimal a propósito: Recharts
 * recibe colores como strings de JavaScript y no puede leer los tokens de
 * Tailwind. Los valores son los de `globals.css`; si allá cambian, acá también.
 *
 * El lima ácido no está en esta lista y no tiene que estarlo: es el color de la
 * acción principal y de nada más.
 */
const GRAPHITE = "#23252a"
const FOG = "#8a8f98"
const CARBON = "#0f1011"
const SIGNAL_TEAL = "#02b8cc"
const PULSE_GREEN = "#27a644"
const CORAL_RED = "#eb5757"

// La rueda decorativa de la torta: los cuatro acentos cromáticos del sistema
// más tres grises, para que una lista larga de categorías no se quede sin
// colores ni invente ninguno.
const COLORS = [SIGNAL_TEAL, "#6366f1", "#8b5cf6", PULSE_GREEN, FOG, "#62666d", "#383b3f"]

const toPesos = (cents: number) => cents / 100
const tip = (value: number) => formatMoney(Math.round(value * 100), "ARS")
// El `formatter` de Tooltip recibe el ValueType genérico de recharts (puede
// ser number, string o un array); acá los datos que le pasamos son siempre
// number, así que sólo se formatea ese caso y el resto se muestra tal cual.
const tooltipFormatter = (value: number | string | ReadonlyArray<number | string> | undefined) =>
  typeof value === "number" ? tip(value) : String(value ?? "")

/*
 * Recharts pinta el tooltip blanco por defecto. Sobre un lienzo casi negro eso
 * es un rectángulo encandilante flotando en el medio del gráfico, así que va
 * sobre Carbon con el mismo borde capilar que las tarjetas.
 */
const TOOLTIP_STYLE = {
  backgroundColor: CARBON,
  border: `1px solid ${GRAPHITE}`,
  borderRadius: 6,
  color: "#d0d6e0",
  fontSize: 13,
} as const

const AXIS = { stroke: GRAPHITE, tick: { fill: FOG, fontSize: 12 } } as const

export function ProjectionChart({
  data,
}: {
  data: { month: string; arsCents: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data.map((d) => ({ month: d.month, saldo: toPesos(d.arsCents) }))}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRAPHITE} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis width={80} {...AXIS} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ stroke: GRAPHITE }} />
        <Line type="monotone" dataKey="saldo" stroke={SIGNAL_TEAL} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
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

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data.map((d) => ({ name: d.name, value: toPesos(d.arsCents) }))}
          dataKey="value"
          nameKey="name"
          outerRadius={80}
          // El borde de cada porción, en Carbon, separa las porciones entre sí
          // sin agregar una línea de color.
          stroke={CARBON}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function MonthlyBars({
  data,
}: {
  data: { month: string; incomeArsCents: number; expenseArsCents: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data.map((d) => ({
          month: d.month,
          Ingresos: toPesos(d.incomeArsCents),
          Egresos: toPesos(d.expenseArsCents),
        }))}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRAPHITE} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis width={80} {...AXIS} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend wrapperStyle={{ fontSize: 13, color: FOG }} />
        {/* Acá el verde y el rojo son datos, no cuerpo de texto: la regla de
            "los importes van en gris" no aplica a una serie de un gráfico. */}
        <Bar dataKey="Ingresos" fill={PULSE_GREEN} />
        <Bar dataKey="Egresos" fill={CORAL_RED} />
      </BarChart>
    </ResponsiveContainer>
  )
}
