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
}: {
  id?: string
  value: IsoDate
  onChange: (next: IsoDate) => void
  ariaLabel: string
  hiddenName?: string
  disabledAfter?: IsoDate
  disabledBefore?: IsoDate
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
            className="h-11 w-full justify-start font-normal"
          >
            <CalendarIcon />
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
