"use client"

import type { ComponentProps } from "react"

import type { ChartTooltipContent } from "@/components/ui/chart"
import { formatMoney, type Currency } from "@/lib/money"

export const FOG = "#8a8f98"
export const SIGNAL_TEAL = "#02b8cc"
export const PULSE_GREEN = "#27a644"
export const CORAL_RED = "#eb5757"

export const toUnits = (cents: number) => cents / 100

export const AXIS_TICK = { fill: FOG, fontSize: 12 } as const

export type TooltipFormatter = NonNullable<
  ComponentProps<typeof ChartTooltipContent>["formatter"]
>

function makeMoneyTooltipFormatter(currency: Currency, compactZeroDecimals = false): TooltipFormatter {
  return function MoneyTooltip(value, name, item) {
    const color = (item.payload as { fill?: string } | undefined)?.fill ?? item.color
    const cents = Math.round(Number(value) * 100)
    const digits: 0 | 2 = compactZeroDecimals && cents % 100 === 0 ? 0 : 2
    return (
      <>
        <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-muted-foreground">{name}</span>
          <span className="font-mono font-medium text-foreground tabular-nums">
            {formatMoney(cents, currency, digits)}
          </span>
        </div>
      </>
    )
  }
}

export const TOOLTIP_FORMATTER_ARS = makeMoneyTooltipFormatter("ARS")
export const TOOLTIP_FORMATTER_USD = makeMoneyTooltipFormatter("USD")
export const TOOLTIP_FORMATTER_ARS_COMPACT = makeMoneyTooltipFormatter("ARS", true)
export const TOOLTIP_FORMATTER_USD_COMPACT = makeMoneyTooltipFormatter("USD", true)
