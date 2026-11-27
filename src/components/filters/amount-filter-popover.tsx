"use client"

import { useState } from "react"

import { centsToInputValue, formatAmountRangeLabel } from "@/components/filters/filter-shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatAmountInput, parseAmountToCents } from "@/lib/money"
import type { MovementQuery } from "@/lib/movement-query"
import { cn } from "@/lib/utils"

const LABEL_CLASS = "text-xs font-normal text-muted-foreground"

export function AmountFilterPopover({
  minCents,
  maxCents,
  onChange,
}: {
  minCents: number | null
  maxCents: number | null
  onChange: (patch: Partial<MovementQuery>) => void
}) {
  const [open, setOpen] = useState(false)
  const [minInput, setMinInput] = useState("")
  const [maxInput, setMaxInput] = useState("")

  const amountLabel = formatAmountRangeLabel(minCents, maxCents)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setMinInput(centsToInputValue(minCents))
      setMaxInput(centsToInputValue(maxCents))
    }
  }

  function apply(e?: React.FormEvent) {
    e?.preventDefault()
    const nextMin = minInput.trim() ? parseAmountToCents(minInput) : null
    const nextMax = maxInput.trim() ? parseAmountToCents(maxInput) : null
    setOpen(false)
    onChange({
      minCents: nextMin !== null && nextMin >= 0 ? nextMin : null,
      maxCents: nextMax !== null && nextMax >= 0 ? nextMax : null,
    })
  }

  return (
    <div className="hidden w-32 space-y-1.5 md:block">
      <Label id="filtro-importe-label" htmlFor="filtro-importe" className={LABEL_CLASS}>
        Importe
      </Label>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id="filtro-importe"
            type="button"
            variant="outline"
            aria-label={`Importe: ${amountLabel}`}
            className={cn(
              "w-full justify-start truncate font-normal",
              minCents === null && maxCents === null && "text-muted-foreground",
            )}
          >
            <span className="truncate">{amountLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-3"
          aria-labelledby="filtro-importe-label"
          align="start"
        >
          <form onSubmit={apply} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="filtro-min" className={LABEL_CLASS}>
                  Mínimo
                </Label>
                <Input
                  id="filtro-min"
                  inputMode="decimal"
                  placeholder="0"
                  value={minInput}
                  onChange={(e) => setMinInput((prev) => formatAmountInput(e.target.value, prev))}
                  className="h-8 tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filtro-max" className={LABEL_CLASS}>
                  Máximo
                </Label>
                <Input
                  id="filtro-max"
                  inputMode="decimal"
                  placeholder="Sin tope"
                  value={maxInput}
                  onChange={(e) => setMaxInput((prev) => formatAmountInput(e.target.value, prev))}
                  className="h-8 tabular-nums"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              {(minCents !== null || maxCents !== null) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setOpen(false)
                    onChange({ minCents: null, maxCents: null })
                  }}
                >
                  Borrar
                </Button>
              )}
              <Button type="submit" size="xs">
                Aplicar
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}
