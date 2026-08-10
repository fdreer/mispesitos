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

const COLORS = ["#0ea5e9", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#eab308", "#14b8a6"]

const toPesos = (cents: number) => cents / 100
const tip = (value: number) => formatMoney(Math.round(value * 100), "ARS")
// El `formatter` de Tooltip recibe el ValueType genérico de recharts (puede
// ser number, string o un array); acá los datos que le pasamos son siempre
// number, así que sólo se formatea ese caso y el resto se muestra tal cual.
const tooltipFormatter = (value: number | string | ReadonlyArray<number | string> | undefined) =>
  typeof value === "number" ? tip(value) : String(value ?? "")

export function ProjectionChart({
  data,
}: {
  data: { month: string; arsCents: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data.map((d) => ({ month: d.month, saldo: toPesos(d.arsCents) }))}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis width={80} />
        <Tooltip formatter={tooltipFormatter} />
        <Line type="monotone" dataKey="saldo" stroke="#0ea5e9" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CategoryPie({ data }: { data: { name: string; arsCents: number }[] }) {
  if (data.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Sin egresos este mes.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data.map((d) => ({ name: d.name, value: toPesos(d.arsCents) }))}
          dataKey="value"
          nameKey="name"
          outerRadius={80}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={tooltipFormatter} />
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
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis width={80} />
        <Tooltip formatter={tooltipFormatter} />
        <Legend />
        <Bar dataKey="Ingresos" fill="#22c55e" />
        <Bar dataKey="Egresos" fill="#ef4444" />
      </BarChart>
    </ResponsiveContainer>
  )
}
