"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import { es } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { dateToIso, formatIsoForDisplay, isoToDate, type IsoDate } from "@/lib/dates"

export function DateField({
  id,
  value,
  onChange,
  ariaLabel,
  hiddenName,
  disabledAfter,
  disabledBefore,
  size = "default",
  className,
}: {
  id?: string
  value: IsoDate
  onChange: (next: IsoDate) => void
  ariaLabel: string
  hiddenName?: string
  disabledAfter?: IsoDate
  disabledBefore?: IsoDate
  size?: "default" | "sm"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const disabled = [
    ...(disabledAfter ? [{ after: isoToDate(disabledAfter) }] : []),
    ...(disabledBefore ? [{ before: isoToDate(disabledBefore) }] : []),
  ]
  return (
    <>
      {hiddenName && <input type="hidden" name={hiddenName} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={ariaLabel}
            className={
              className ??
              (size === "sm"
                ? "h-9 w-full justify-start gap-1.5 px-2.5 text-sm font-normal tabular-nums"
                : "h-10 w-full justify-start gap-2 font-normal tabular-nums")
            }
          >
            <CalendarIcon className={size === "sm" ? "size-3.5 text-muted-foreground" : "text-muted-foreground"} />
            {formatIsoForDisplay(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={es}
            required
            selected={isoToDate(value)}
            defaultMonth={isoToDate(value)}
            disabled={disabled.length > 0 ? disabled : undefined}
            onSelect={(d) => {
              onChange(dateToIso(d))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  )
}
