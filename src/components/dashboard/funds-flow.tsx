import Link from "next/link"
import { AlertCircle, AlertTriangle } from "lucide-react"

import { CashflowChart } from "@/components/reports/report-charts"
import { formatMoney } from "@/lib/money"
import type { CashflowReportView } from "@/lib/reports-cashflow"
import { cn } from "@/lib/utils"

const ars = (cents: number) => formatMoney(cents, "ARS", 0)

/**
 * El flujo de fondos de los próximos meses: el gráfico y, debajo, la tabla
 * chica con lo que entra, lo que sale y con cuánto queda cada mes. Lo vencido
 * va en un renglón propio arriba porque no tiene mes: es plata que ya se debía.
 */
export function FundsFlow({ view }: { view: CashflowReportView }) {
  const { rows, overdue, negativeAlert, missingRateForUsd } = view
  const hasOverdue = overdue.expenseCount > 0 || overdue.incomeCount > 0

  return (
    <div className="space-y-4">
      {(negativeAlert || missingRateForUsd) && (
        <div className="space-y-2">
          {negativeAlert && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-coral-red/40 bg-coral-red/10 px-3 py-2 text-sm text-paper"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-coral-red" aria-hidden />
              <span>
                En {negativeAlert.periodLabel} te faltarían{" "}
                <span className="font-medium tabular-nums">{ars(negativeAlert.shortageCents)}</span>
                {negativeAlert.includesOverdue && (
                  <span className="text-muted-foreground"> (contando lo vencido)</span>
                )}
                .
              </span>
            </p>
          )}
          {missingRateForUsd && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-ember-orange/40 bg-ember-orange/10 px-3 py-2 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-ember-orange" aria-hidden />
              <span>
                Sin cotización oficial del dólar: los importes en dólares no entran en la proyección.
              </span>
            </p>
          )}
        </div>
      )}

      {rows.length > 0 && <CashflowChart rows={rows} height={240} />}

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="py-2 pr-2 text-left font-medium">Mes</th>
              <th className="px-2 py-2 text-right font-medium">Entra</th>
              <th className="px-2 py-2 text-right font-medium">Sale</th>
              <th className="py-2 pl-2 text-right font-medium">Queda</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {hasOverdue && (
              <tr>
                <td className="py-2 pr-2">
                  <Link
                    href="/egresos?status=overdue"
                    className="text-coral-red underline-offset-2 hover:underline"
                  >
                    Vencido
                  </Link>
                </td>
                <td className="text-muted-foreground px-2 py-2 text-right">
                  {overdue.incomeCents > 0 ? ars(overdue.incomeCents) : "—"}
                </td>
                <td className="px-2 py-2 text-right text-coral-red">
                  {overdue.expenseCents > 0 ? ars(overdue.expenseCents) : "—"}
                </td>
                <td className="text-muted-foreground py-2 pl-2 text-right">—</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-2 pr-2 text-foreground capitalize">{row.label}</td>
                <td className="px-2 py-2 text-right text-pulse-green/90">
                  {row.inflowsCents > 0 ? ars(row.inflowsCents) : <Dash />}
                </td>
                <td className="px-2 py-2 text-right">
                  {row.outflowsCents > 0 ? ars(row.outflowsCents) : <Dash />}
                </td>
                <td
                  className={cn(
                    "py-2 pl-2 text-right font-medium",
                    row.closingCents < 0 ? "text-coral-red" : "text-paper",
                  )}
                >
                  {ars(row.closingCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Dash() {
  return <span className="text-muted-foreground">—</span>
}
