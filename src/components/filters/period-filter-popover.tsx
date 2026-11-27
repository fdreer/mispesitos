"use client"

import { useEffect, useRef, useState } from "react"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DATE_PRESETS, detectDatePreset, presetRange, shiftPeriod } from "@/lib/date-presets"
import { dateToIso, isoToDate, type IsoDate } from "@/lib/dates"
import type { MovementQuery } from "@/lib/movement-query"
import { cn } from "@/lib/utils"

const LABEL_CLASS = "text-xs font-normal text-muted-foreground"

export function rangeFromQuery(query: Pick<MovementQuery, "from" | "to">): DateRange | undefined {
  return query.from || query.to
    ? {
        from: query.from ? isoToDate(query.from) : undefined,
        to: query.to ? isoToDate(query.to) : undefined,
      }
    : undefined
}

export function rangeToPatch(range: DateRange | undefined): Pick<MovementQuery, "from" | "to"> {
  return {
    from: range?.from ? dateToIso(range.from) : "",
    to: range?.to ? dateToIso(range.to) : "",
  }
}

export function PeriodFilterPopover({
  from,
  to,
  today,
  periodLabel,
  calendarStartMonth,
  calendarEndMonth,
  isToolbar,
  pending,
  onChange,
}: {
  from: IsoDate | ""
  to: IsoDate | ""
  today: IsoDate
  periodLabel: string
  calendarStartMonth: Date
  calendarEndMonth: Date
  isToolbar: boolean
  pending: boolean
  onChange: (patch: Partial<MovementQuery>) => void
}) {
  const [draft, setDraft] = useState<DateRange | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const prevRangeRef = useRef({ from, to })

  useEffect(() => {
    if (open && (from !== prevRangeRef.current.from || to !== prevRangeRef.current.to)) {
      setDraft(rangeFromQuery({ from, to }))
    }
    prevRangeRef.current = { from, to }
  }, [from, to, open])

  const prevShift = shiftPeriod(from, to, -1)
  const nextShift = shiftPeriod(from, to, 1)
  const activePreset = detectDatePreset(from, to, today)

  function handleCalendarSelect(range: DateRange | undefined, triggerDate: Date) {
    if (!draft?.from) {
      setDraft({ from: triggerDate, to: undefined })
      return
    }
    setDraft(range)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setDraft(rangeFromQuery({ from, to }))
      return
    }
    const patch = rangeToPatch(draft)
    setDraft(undefined)
    if (patch.from === prevRangeRef.current.from && patch.to === prevRangeRef.current.to) return
    prevRangeRef.current = { from: patch.from, to: patch.to }
    onChange(patch)
  }

  function handlePresetClick(presetId: (typeof DATE_PRESETS)[number]["id"]) {
    const range = presetRange(presetId, today)
    setDraft(undefined)
    setOpen(false)
    onChange(range)
  }

  return (
    <div className={isToolbar ? "hidden md:block" : "hidden space-y-1.5 md:block"}>
      <Label
        id="filtro-periodo-label"
        htmlFor="filtro-periodo"
        className={cn(LABEL_CLASS, isToolbar && "sr-only")}
      >
        Período
      </Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Período anterior"
          disabled={!prevShift}
          onClick={() => prevShift && onChange(prevShift)}
        >
          <ChevronLeft />
        </Button>
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              id="filtro-periodo"
              type="button"
              variant="outline"
              aria-label={`Período: ${periodLabel}`}
              className={cn(
                "w-44 justify-start font-normal",
                !from && !to && "text-muted-foreground",
              )}
            >
              <CalendarIcon />
              <span className="truncate">{periodLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className={cn("w-auto p-0 transition-opacity", pending && "opacity-60")}
            aria-busy={pending}
            aria-labelledby="filtro-periodo-label"
            align="start"
          >
            <div className="flex flex-col sm:flex-row">
              <div className="flex flex-col gap-0.5 border-b p-2 sm:w-44 sm:border-r sm:border-b-0">
                {DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "justify-start font-normal",
                      activePreset === preset.id && "bg-accent text-paper font-medium",
                    )}
                    onClick={() => handlePresetClick(preset.id)}
                  >
                    {preset.label}
                  </Button>
                ))}
                <span
                  className={cn(
                    "mt-1 rounded-md px-2.5 py-1 text-xs",
                    activePreset === "custom"
                      ? "bg-accent text-paper font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  Personalizado
                </span>
              </div>
              <div>
                <Calendar
                  mode="range"
                  locale={es}
                  captionLayout="dropdown"
                  startMonth={calendarStartMonth}
                  endMonth={calendarEndMonth}
                  defaultMonth={draft?.from ?? draft?.to}
                  selected={draft}
                  onSelect={handleCalendarSelect}
                />
                {(draft?.from || draft?.to) && (
                  <div className="flex justify-end border-t p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDraft(undefined)
                        prevRangeRef.current = { from: "", to: "" }
                        onChange({ ...rangeToPatch(undefined), dateField: "date" })
                      }}
                    >
                      Borrar rango
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Período siguiente"
          disabled={!nextShift}
          onClick={() => nextShift && onChange(nextShift)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
