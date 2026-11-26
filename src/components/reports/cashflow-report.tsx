import Link from "next/link"
import { AlertCircle, AlertTriangle } from "lucide-react"

import {
  BalanceAmount,
  BalanceHeader,
  BalanceNote,
} from "@/components/dashboard/balance-cards"
import { InfoHint } from "@/components/info-hint"
import { CashflowChart } from "@/components/reports/report-charts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney, type Currency } from "@/lib/money"
import type { CashflowReportView, CashflowRowKind } from "@/lib/reports-cashflow"
import { cn } from "@/lib/utils"

function formatAmount(cents: number, currency: Currency): string {
  return formatMoney(cents, currency, cents % 100 === 0 ? 0 : 2)
}

function KindBadge({ kind, beforeInitial }: { kind: CashflowRowKind; beforeInitial: boolean }) {
  if (beforeInitial) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Sin datos
      </Badge>
    )
  }
  if (kind === "real") return <Badge variant="secondary">Real</Badge>
  if (kind === "mixed") return <Badge variant="warning">En curso</Badge>
  return (
    <Badge variant="outline" className="border-dashed text-muted-foreground">
      Proyectado
    </Badge>
  )
}

export function CashflowReport({ view }: { view: CashflowReportView }) {
  const {
    displayCurrency,
    rows,
    overdue,
    negativeAlert,
    currentBalanceCents,
    projectedEndBalanceCents,
  } = view

  const validRows = rows.filter((r) => !r.beforeInitialBalance)
  const periodNetCents = validRows.reduce((acc, r) => acc + r.netCents, 0)
  const hasOverdue = overdue.expenseCents > 0 || overdue.incomeCents > 0

  return (
    <div className="space-y-6">
      {(hasOverdue || negativeAlert) && (
        <div className="space-y-2.5">
          {negativeAlert && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-coral-red/40 bg-coral-red/10 px-4 py-3 text-sm text-foreground"
            >
              <span className="flex items-center gap-2 font-medium text-paper">
                <AlertTriangle className="size-4 shrink-0 text-coral-red" aria-hidden />
                <span>
                  En {negativeAlert.periodLabel} te faltarían{" "}
                  <span className="tabular-nums">
                    {formatAmount(negativeAlert.shortageCents, displayCurrency)}
                  </span>
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

          {hasOverdue && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ember-orange/40 bg-ember-orange/10 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <AlertCircle className="size-4 shrink-0 text-ember-orange" aria-hidden />
                <span className="font-medium text-paper">
                  Atrasado:{" "}
                  <span className="tabular-nums">
                    {overdue.expenseCents > 0
                      ? formatAmount(overdue.expenseCents, displayCurrency)
                      : formatAmount(overdue.incomeCents, displayCurrency)}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {overdue.expenseCount > 0 &&
                    `${overdue.expenseCount} ${overdue.expenseCount === 1 ? "cuota vencida a pagar" : "cuotas vencidas a pagar"}`}
                  {overdue.expenseCount > 0 && overdue.incomeCount > 0 && " · "}
                  {overdue.incomeCount > 0 &&
                    `${overdue.incomeCount} ${overdue.incomeCount === 1 ? "cobro vencido" : "cobros vencidos"} (${formatAmount(overdue.incomeCents, displayCurrency)})`}
                </span>
              </span>
              <span className="flex items-center gap-3 text-xs">
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
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card size="sm" className="gap-2 py-3">
          <BalanceHeader
            title="Saldo real hoy"
            hint="Saldo inicial más movimientos pagados y cambios de dólares hasta hoy."
          />
          <CardContent>
            <BalanceAmount>{formatMoney(currentBalanceCents, displayCurrency, 0)}</BalanceAmount>
          </CardContent>
        </Card>

        <Card size="sm" className="gap-2 py-3">
          <BalanceHeader title="Neto del período" />
          <CardContent>
            <BalanceAmount>{formatMoney(periodNetCents, displayCurrency, 0)}</BalanceAmount>
            <BalanceNote>
              {validRows.length} {view.granularity === "semanal" ? "semanas" : "meses"}
            </BalanceNote>
          </CardContent>
        </Card>

        <Card size="sm" className="gap-2 py-3">
          <BalanceHeader
            title="Saldo al cierre del período"
            hint="Saldo proyectado al final del último período visible, sin descontar cuotas atrasadas."
          />
          <CardContent>
            <BalanceAmount>
              {formatMoney(projectedEndBalanceCents, displayCurrency, 0)}
            </BalanceAmount>
            {rows.at(-1) && <BalanceNote>{rows.at(-1)!.label}</BalanceNote>}
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            Neto y saldo acumulado
            <InfoHint label="Cómo se calcula el flujo de caja">
              Los períodos pasados muestran lo efectivamente pagado y los cambios de dólares. El mes
              en curso suma lo ya percibido más lo pendiente por vencer hasta fin de mes. Los
              períodos futuros proyectan cuotas impagas (incluidos resúmenes de tarjeta). Lo atrasado
              se muestra aparte.
            </InfoHint>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {validRows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Este período es anterior a la fecha de tu saldo inicial.
            </p>
          ) : (
            <CashflowChart rows={rows} currency={displayCurrency} />
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
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Saldo inicial</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Salidas</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Saldo final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isProjected = row.kind !== "real" && !row.beforeInitialBalance
                return (
                  <TableRow
                    key={row.key}
                    className={cn(
                      row.beforeInitialBalance && "text-muted-foreground opacity-50",
                      isProjected && "border-dashed bg-muted/15 text-muted-foreground",
                    )}
                  >
                    <TableCell
                      className={cn(
                        "sticky left-0 z-10 bg-card font-medium",
                        isProjected ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {row.label}
                    </TableCell>
                    <TableCell>
                      <KindBadge kind={row.kind} beforeInitial={row.beforeInitialBalance} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.beforeInitialBalance
                        ? "—"
                        : formatAmount(row.initialCents, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.beforeInitialBalance
                        ? "—"
                        : formatAmount(row.inflowsCents, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.beforeInitialBalance
                        ? "—"
                        : formatAmount(row.outflowsCents, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.beforeInitialBalance
                        ? "—"
                        : formatAmount(row.netCents, displayCurrency)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        !row.beforeInitialBalance &&
                          row.closingCents < 0 &&
                          "text-coral-red",
                      )}
                    >
                      {row.beforeInitialBalance
                        ? "—"
                        : formatAmount(row.closingCents, displayCurrency)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
