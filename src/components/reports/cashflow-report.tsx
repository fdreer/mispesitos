import Link from "next/link"
import { AlertCircle, AlertTriangle, CreditCard } from "lucide-react"

import {
  BalanceAmount,
  BalanceHeader,
  BalanceNote,
} from "@/components/dashboard/balance-cards"
import { InfoHint } from "@/components/info-hint"
import { CashflowChart } from "@/components/reports/report-charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPeriod } from "@/lib/cards"
import { formatIsoForDisplay } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { formatOfficialRateLabel } from "@/lib/rate"
import type { CashflowReportView } from "@/lib/reports-cashflow"
import { cn } from "@/lib/utils"

function formatArs(cents: number): string {
  return formatMoney(cents, "ARS", cents % 100 === 0 ? 0 : 2)
}

export function CashflowReport({ view }: { view: CashflowReportView }) {
  const {
    rows,
    balances,
    usdBalanceInArsCents,
    officialRate,
    missingRateForUsd,
    overdue,
    negativeAlert,
    upcomingCards,
    currentBalanceCents,
    projectedEndBalanceCents,
  } = view

  const periodNetCents = rows.reduce((acc, r) => acc + r.netCents, 0)
  const committedCents =
    rows.reduce((acc, r) => acc + r.outflowsCents, 0) + overdue.expenseCents
  const incomingCents = rows.reduce((acc, r) => acc + r.inflowsCents, 0) + overdue.incomeCents
  const hasOverdue =
    overdue.expenseCount > 0 ||
    overdue.incomeCount > 0

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <div className="min-w-0 space-y-6">
        {(missingRateForUsd || negativeAlert) && (
          <div className="space-y-2.5">
            {missingRateForUsd && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-ember-orange/40 bg-ember-orange/10 px-4 py-3 text-sm text-foreground"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-ember-orange" aria-hidden />
                <span>
                  No pudimos obtener la cotización oficial del dólar y todavía no hay una guardada.
                  Los importes en dólares no se incluyeron en esta proyección.
                </span>
              </div>
            )}

            {negativeAlert && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-coral-red/40 bg-coral-red/10 px-4 py-3 text-sm text-foreground"
              >
                <span className="flex items-center gap-2 font-medium text-paper">
                  <AlertTriangle className="size-4 shrink-0 text-coral-red" aria-hidden />
                  <span>
                    En {negativeAlert.periodLabel} te faltarían{" "}
                    <span className="tabular-nums">{formatArs(negativeAlert.shortageCents)}</span>
                    {negativeAlert.includesOverdue && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        (contando lo atrasado)
                      </span>
                    )}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            size="sm"
            className="gap-2 py-3 ring-1 ring-signal-teal/25 bg-gradient-to-br from-signal-teal/[0.07] to-transparent"
          >
            <BalanceHeader
              title="Punto de partida hoy"
              hint="Saldo real en pesos más tu saldo en dólares valuado al oficial comprador."
            />
            <CardContent>
              <BalanceAmount className="text-paper">
                {formatMoney(currentBalanceCents, "ARS", 0)}
              </BalanceAmount>
            </CardContent>
          </Card>

          <Card size="sm" className="gap-2 py-3">
            <BalanceHeader
              title="Comprometido"
              hint="Egresos pendientes del período (cuotas, resúmenes de tarjeta, gastos fijos) más lo atrasado. Los dólares, al oficial vendedor."
            />
            <CardContent>
              <BalanceAmount>{formatMoney(committedCents, "ARS", 0)}</BalanceAmount>
              <BalanceNote className="tabular-nums">
                Entran {formatMoney(incomingCents, "ARS", 0)} · neto{" "}
                <span className={cn(periodNetCents < 0 ? "text-coral-red" : "text-pulse-green")}>
                  {formatMoney(periodNetCents, "ARS", 0)}
                </span>
              </BalanceNote>
            </CardContent>
          </Card>

          <Card size="sm" className="gap-2 py-3">
            <BalanceHeader
              title="Saldo al cierre del período"
              hint="Saldo proyectado al final del último período visible, sin descontar cuotas atrasadas."
            />
            <CardContent>
              <BalanceAmount className={cn(projectedEndBalanceCents < 0 && "text-coral-red")}>
                {formatMoney(projectedEndBalanceCents, "ARS", 0)}
              </BalanceAmount>
              {rows.at(-1) && <BalanceNote>{rows.at(-1)!.label}</BalanceNote>}
            </CardContent>
          </Card>
        </div>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              Entradas, salidas y saldo
              <InfoHint label="Cómo se calcula el flujo de caja">
                Arranca desde hoy con tu saldo real en pesos más tus dólares valuados al oficial
                comprador. Los cobros pendientes en dólares se valuán al oficial comprador y los
                egresos pendientes en dólares (incluidos resúmenes de tarjeta) al oficial vendedor.
                Lo atrasado se muestra aparte.
              </InfoHint>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No hay períodos para mostrar en el rango elegido.
              </p>
            ) : (
              <CashflowChart rows={rows} />
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-base">
              {view.granularity === "semanal" ? "Evolución semanal" : "Evolución mensual"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-32 bg-card">Período</TableHead>
                  <TableHead className="text-right">Saldo inicial</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Salidas</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">Saldo final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="sticky left-0 z-10 bg-card font-medium text-foreground">
                      {row.label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatArs(row.initialCents)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        row.inflowsCents > 0 ? "text-pulse-green/90" : "text-muted-foreground",
                      )}
                    >
                      {formatArs(row.inflowsCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatArs(row.outflowsCents)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        row.netCents < 0 ? "text-coral-red" : "text-muted-foreground",
                      )}
                    >
                      {row.netCents > 0 && "+"}
                      {formatArs(row.netCents)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        row.closingCents < 0 && "text-coral-red",
                      )}
                    >
                      {formatArs(row.closingCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Panel lateral */}
      <aside className="space-y-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saldos de hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">En pesos</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(balances.arsCents, "ARS", 0)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">En dólares</span>
              <span className="text-right">
                <span className="block font-semibold tabular-nums">
                  {formatMoney(balances.usdCents, "USD")}
                </span>
                {usdBalanceInArsCents !== null && balances.usdCents !== 0 && (
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    ≈ {formatMoney(usdBalanceInArsCents, "ARS", 0)}
                  </span>
                )}
              </span>
            </div>
            <div className="border-t pt-3 text-xs text-muted-foreground">
              {officialRate ? (
                <>
                  <p className="font-medium text-foreground">
                    Dólar {formatOfficialRateLabel(officialRate.fetchedAt)}
                    {officialRate.stale && " (guardada)"}
                  </p>
                  <p className="tabular-nums">
                    Compra {formatMoney(Math.round(officialRate.compra * 100), "ARS")} · Venta{" "}
                    {formatMoney(Math.round(officialRate.venta * 100), "ARS")}
                  </p>
                </>
              ) : (
                <p>Sin cotización oficial disponible.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <CreditCard className="size-4" aria-hidden />
              Próximos vencimientos de tarjetas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingCards.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tenés resúmenes pendientes.</p>
            ) : (
              <ul className="divide-y text-sm">
                {upcomingCards.slice(0, 6).map((c) => (
                  <li key={c.id} className="py-2 first:pt-0 last:pb-0">
                    <Link
                      href={`/tarjetas/${c.cardId}?periodo=${c.period}`}
                      className="block space-y-0.5 hover:underline"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-foreground">
                          {c.cardName} · {formatPeriod(c.period)}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatIsoForDisplay(c.dueDate).slice(0, 5)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {c.arsCents > 0 && formatArs(c.arsCents)}
                        {c.arsCents > 0 && c.usdCents > 0 && " · "}
                        {c.usdCents > 0 && (
                          <>
                            {formatMoney(c.usdCents, "USD")}
                            {c.usdInArsCents !== null && ` ≈ ${formatArs(c.usdInArsCents)}`}
                          </>
                        )}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {hasOverdue && (
          <Card size="sm" className="border-ember-orange/40 bg-ember-orange/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-paper">
                <AlertCircle className="size-4 text-ember-orange" aria-hidden />
                Atrasado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {overdue.expenseCount > 0 && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">
                    {overdue.expenseCount}{" "}
                    {overdue.expenseCount === 1 ? "pago vencido" : "pagos vencidos"}
                  </span>
                  <span className="font-medium text-paper tabular-nums">
                    {overdue.expenseCents > 0 && formatArs(overdue.expenseCents)}
                    {overdue.unconvertedUsdExpenseCents > 0 && (
                      <>
                        {overdue.expenseCents > 0 ? " + " : ""}
                        {formatMoney(overdue.unconvertedUsdExpenseCents, "USD")}
                      </>
                    )}
                  </span>
                </div>
              )}
              {overdue.incomeCount > 0 && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">
                    {overdue.incomeCount}{" "}
                    {overdue.incomeCount === 1 ? "cobro vencido" : "cobros vencidos"}
                  </span>
                  <span className="font-medium text-paper tabular-nums">
                    {overdue.incomeCents > 0 && formatArs(overdue.incomeCents)}
                    {overdue.unconvertedUsdIncomeCents > 0 && (
                      <>
                        {overdue.incomeCents > 0 ? " + " : ""}
                        {formatMoney(overdue.unconvertedUsdIncomeCents, "USD")}
                      </>
                    )}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-3 pt-1">
                {overdue.expenseCount > 0 && (
                  <Link
                    href="/egresos?status=overdue"
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Ver egresos vencidos
                  </Link>
                )}
                {overdue.incomeCount > 0 && (
                  <Link
                    href="/ingresos?status=overdue"
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Ver cobros vencidos
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  )
}
