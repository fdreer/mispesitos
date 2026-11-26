"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"

import {
  BalanceAmount,
  BalanceHeader,
} from "@/components/dashboard/balance-cards"
import { InfoHint } from "@/components/info-hint"
import { PnlChart } from "@/components/reports/report-charts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { categoryHue, hueColor } from "@/lib/category-color"
import { formatMoney, type Currency } from "@/lib/money"
import type { MovementQuery } from "@/lib/movement-query"
import type { ReportCurrency } from "@/lib/report-query"
import {
  buildPnlCellHref,
  formatShortMonth,
  type PnlParentRow,
  type PnlReportView,
} from "@/lib/reports-pnl"
import { cn } from "@/lib/utils"

function formatAmountCompact(cents: number, currency: Currency): string {
  return formatMoney(cents, currency, cents % 100 === 0 ? 0 : 2)
}

function formatVar(pct: number | null): string {
  if (pct === null) return "—"
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : ""
  return `${sign}${rounded.toLocaleString("es-AR", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatSavingsRate(pct: number | null): string {
  if (pct === null) return "—"
  return `${pct.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function CategorySectionRows({
  kind,
  title,
  totalLabel,
  rows,
  view,
  currencyMode,
  filters,
  expanded,
  toggle,
  showVariation,
}: {
  kind: "income" | "expense"
  title: string
  totalLabel: string
  rows: PnlParentRow[]
  view: PnlReportView
  currencyMode: ReportCurrency
  filters: MovementQuery
  expanded: Set<string>
  toggle: (key: string) => void
  showVariation: boolean
}) {
  const { displayCurrency, months, effectiveFrom, effectiveTo, totalsByMonth, grandTotal } = view
  const sectionTotalCents =
    kind === "income" ? grandTotal.incomeCents : grandTotal.expenseCents

  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell
          colSpan={months.length + 2}
          className="py-1.5 text-xs font-medium text-muted-foreground"
        >
          {title}
        </TableCell>
      </TableRow>

      {rows.length === 0 ? (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={months.length + 2}
            className="text-muted-foreground py-3 text-xs"
          >
            Sin {title.toLocaleLowerCase()} en este período.
          </TableCell>
        </TableRow>
      ) : (
        rows.map((row) => {
          const rowKey = `${kind}:${row.name}`
          const expandable = row.children.length > 0
          const isOpen = expanded.has(rowKey)
          const color = hueColor(row.hue ?? categoryHue(row.name))
          const canLink = row.categoryIds.length > 0

          return (
            <Fragment key={rowKey}>
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-card font-medium text-foreground">
                  <div className="flex items-center gap-1.5">
                    {expandable ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Contraer" : "Expandir"} ${row.name}`}
                        onClick={() => toggle(rowKey)}
                        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm"
                      >
                        {isOpen ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                    ) : (
                      <span aria-hidden className="inline-block w-5 shrink-0" />
                    )}
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate">{row.name}</span>
                  </div>
                </TableCell>

                {row.cells.map((cell) => {
                  const href =
                    canLink && cell.amountCents > 0
                      ? buildPnlCellHref({
                          kind,
                          categoryIds: row.categoryIds,
                          month: cell.month,
                          effectiveFrom,
                          effectiveTo,
                          currencyMode,
                          filters,
                        })
                      : null

                  return (
                    <TableCell key={cell.month} className="text-right tabular-nums">
                      {cell.amountCents === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : href ? (
                        <Link
                          href={href}
                          className="underline-offset-4 hover:text-paper hover:underline"
                        >
                          {formatAmountCompact(cell.amountCents, displayCurrency)}
                        </Link>
                      ) : (
                        formatAmountCompact(cell.amountCents, displayCurrency)
                      )}
                      {showVariation && (
                        <span className="text-muted-foreground block text-[11px]">
                          {formatVar(cell.variationPct)}
                        </span>
                      )}
                    </TableCell>
                  )
                })}

                <TableCell className="text-right font-medium tabular-nums">
                  {canLink ? (
                    <Link
                      href={buildPnlCellHref({
                        kind,
                        categoryIds: row.categoryIds,
                        month: null,
                        effectiveFrom,
                        effectiveTo,
                        currencyMode,
                        filters,
                      })}
                      className="underline-offset-4 hover:text-paper hover:underline"
                    >
                      {formatAmountCompact(row.totalCents, displayCurrency)}
                    </Link>
                  ) : (
                    formatAmountCompact(row.totalCents, displayCurrency)
                  )}
                </TableCell>
              </TableRow>

              {expandable &&
                isOpen &&
                row.children.map((child) => {
                  const childCanLink = child.categoryIds.length > 0
                  return (
                    <TableRow key={`${rowKey}:${child.name}`} className="bg-muted/15">
                      <TableCell className="sticky left-0 z-10 bg-card pl-9 text-muted-foreground">
                        <span className="truncate">{child.name}</span>
                      </TableCell>
                      {child.cells.map((cell) => {
                        const href =
                          childCanLink && cell.amountCents > 0
                            ? buildPnlCellHref({
                                kind,
                                categoryIds: child.categoryIds,
                                month: cell.month,
                                effectiveFrom,
                                effectiveTo,
                                currencyMode,
                                filters,
                              })
                            : null
                        return (
                          <TableCell
                            key={cell.month}
                            className="text-right text-muted-foreground tabular-nums"
                          >
                            {cell.amountCents === 0 ? (
                              "—"
                            ) : href ? (
                              <Link
                                href={href}
                                className="underline-offset-4 hover:text-foreground hover:underline"
                              >
                                {formatAmountCompact(cell.amountCents, displayCurrency)}
                              </Link>
                            ) : (
                              formatAmountCompact(cell.amountCents, displayCurrency)
                            )}
                            {showVariation && (
                              <span className="block text-[11px] opacity-80">
                                {formatVar(cell.variationPct)}
                              </span>
                            )}
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {childCanLink ? (
                          <Link
                            href={buildPnlCellHref({
                              kind,
                              categoryIds: child.categoryIds,
                              month: null,
                              effectiveFrom,
                              effectiveTo,
                              currencyMode,
                              filters,
                            })}
                            className="underline-offset-4 hover:text-foreground hover:underline"
                          >
                            {formatAmountCompact(child.totalCents, displayCurrency)}
                          </Link>
                        ) : (
                          formatAmountCompact(child.totalCents, displayCurrency)
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
            </Fragment>
          )
        })
      )}

      <TableRow className="bg-muted/20 font-medium">
        <TableCell className="sticky left-0 z-10 bg-card text-foreground">
          {totalLabel}
        </TableCell>
        {totalsByMonth.map((m) => {
          const val = kind === "income" ? m.incomeCents : m.expenseCents
          const varPct = kind === "income" ? m.incomeVarPct : m.expenseVarPct
          return (
            <TableCell key={m.month} className="text-right tabular-nums">
              {val === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <Link
                  href={buildPnlCellHref({
                    kind,
                    categoryIds: filters.categoryIds,
                    month: m.month,
                    effectiveFrom,
                    effectiveTo,
                    currencyMode,
                    filters,
                  })}
                  className="underline-offset-4 hover:text-paper hover:underline"
                >
                  {formatAmountCompact(val, displayCurrency)}
                </Link>
              )}
              {showVariation && (
                <span className="text-muted-foreground block text-[11px] font-normal">
                  {formatVar(varPct)}
                </span>
              )}
            </TableCell>
          )
        })}
        <TableCell className="text-right tabular-nums">
          {sectionTotalCents === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Link
              href={buildPnlCellHref({
                kind,
                categoryIds: filters.categoryIds,
                month: null,
                effectiveFrom,
                effectiveTo,
                currencyMode,
                filters,
              })}
              className="underline-offset-4 hover:text-paper hover:underline"
            >
              {formatAmountCompact(sectionTotalCents, displayCurrency)}
            </Link>
          )}
        </TableCell>
      </TableRow>
    </>
  )
}

export function PnlReport({
  view,
  currencyMode,
  filters,
  hasActiveFilters,
}: {
  view: PnlReportView
  currencyMode: ReportCurrency
  filters: MovementQuery
  hasActiveFilters: boolean
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showVariation, setShowVariation] = useState(false)

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const { displayCurrency, summary, chart, incomeRows, expenseRows, months, totalsByMonth, grandTotal } =
    view
  const hasAnyData = incomeRows.length > 0 || expenseRows.length > 0

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm" className="gap-2 py-3">
          <BalanceHeader title="Total ingresos" />
          <CardContent>
            <BalanceAmount>{formatMoney(summary.incomeCents, displayCurrency, 0)}</BalanceAmount>
          </CardContent>
        </Card>

        <Card size="sm" className="gap-2 py-3">
          <BalanceHeader title="Total gastos" />
          <CardContent>
            <BalanceAmount>{formatMoney(summary.expenseCents, displayCurrency, 0)}</BalanceAmount>
          </CardContent>
        </Card>

        <Card size="sm" className="gap-2 py-3">
          <BalanceHeader title="Resultado" />
          <CardContent>
            <BalanceAmount>{formatMoney(summary.netCents, displayCurrency, 0)}</BalanceAmount>
          </CardContent>
        </Card>

        <Card size="sm" className="gap-2 py-3">
          <BalanceHeader
            title="Tasa de ahorro"
            hint="Resultado neto dividido entre el total de ingresos del período."
          />
          <CardContent>
            <BalanceAmount>{formatSavingsRate(summary.savingsRatePct)}</BalanceAmount>
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            Ingresos y gastos por mes
            <InfoHint label="Cómo se calcula: Ingresos y gastos por mes">
              Suma cuotas pagadas según su fecha de pago (criterio de lo percibido). Las compras
              con tarjeta cuentan en el mes en que pagaste el resumen. Los cambios de dólares no son
              ingreso ni gasto.
            </InfoHint>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasAnyData ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No hay movimientos pagados en este período.
            </p>
          ) : (
            <PnlChart data={chart} currency={displayCurrency} />
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            Estado por categoría
            <InfoHint label="Cómo leer esta tabla">
              Cada fila agrupa por categoría padre; si tiene subcategorías, podés desplegarla. Tocá
              cualquier importe para ver esos movimientos en el listado.
            </InfoHint>
          </CardTitle>
          {hasAnyData && (
            <CardAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={showVariation}
                onClick={() => setShowVariation((v) => !v)}
                className={cn(
                  showVariation && "border-mist/40 bg-accent text-paper",
                )}
              >
                Variación %
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {!hasAnyData ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-muted-foreground text-sm">
                {hasActiveFilters
                  ? "Ningún movimiento pagado entra en los filtros elegidos."
                  : "Todavía no tenés cuotas pagadas en este período."}
              </p>
              {hasActiveFilters && (
                <Button asChild variant="outline" size="sm">
                  <Link href={currencyMode === "todo" ? "/informes" : `/informes?moneda=${currencyMode}`}>
                    Limpiar filtros
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-44 bg-card">
                    Categoría
                  </TableHead>
                  {months.map((m) => (
                    <TableHead key={m} className="min-w-24 text-right">
                      {formatShortMonth(m)}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-28 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <CategorySectionRows
                  kind="income"
                  title="Ingresos"
                  totalLabel="Total ingresos"
                  rows={incomeRows}
                  view={view}
                  currencyMode={currencyMode}
                  filters={filters}
                  expanded={expanded}
                  toggle={toggle}
                  showVariation={showVariation}
                />
                <CategorySectionRows
                  kind="expense"
                  title="Gastos"
                  totalLabel="Total gastos"
                  rows={expenseRows}
                  view={view}
                  currencyMode={currencyMode}
                  filters={filters}
                  expanded={expanded}
                  toggle={toggle}
                  showVariation={showVariation}
                />
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="sticky left-0 z-10 bg-card font-semibold text-paper">
                    Resultado neto
                  </TableCell>
                  {totalsByMonth.map((m) => (
                    <TableCell
                      key={m.month}
                      className="text-right font-semibold text-paper tabular-nums"
                    >
                      {formatAmountCompact(m.netCents, displayCurrency)}
                      {showVariation && (
                        <span className="text-muted-foreground block text-[11px] font-normal">
                          {formatVar(m.netVarPct)}
                        </span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold text-paper tabular-nums">
                    {formatAmountCompact(grandTotal.netCents, displayCurrency)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
