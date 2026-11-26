"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import { es } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { dateToIso, formatIsoForDisplay, isoToDate, type IsoDate } from "@/lib/dates"

/**
 * Un solo picker para toda fecha que se elige en un formulario: mismo
 * Popover + Calendar que exchange-form.tsx y settings-form.tsx, no el
 * `<input type="date">` nativo (calendario del sistema operativo, no respeta
 * el tema oscuro). El estado de apertura vive ACÁ, por instancia: con hasta
 * MAX_INSTALLMENTS filas de vencimiento en pantalla, cada una necesita poder
 * abrirse y cerrarse sola.
 *
 * `ariaLabel` viaja completo desde el llamador (no sólo un título): reproduce
 * el mismo hallazgo D que ya resolvieron exchange-form.tsx y
 * movement-filters.tsx —un <label htmlFor> que apunte a este botón le gana la
 * resolución de nombre accesible al contenido y corta ahí sin leer la fecha—
 * así que acá también hace falta el mismo `aria-label` con el valor adentro.
 *
 * Vivía adentro de movement-form.tsx; salió de ahí en la Fase 3 porque los
 * diálogos de los resúmenes de tarjeta (fecha de pago, cierre y vencimiento)
 * necesitan exactamente lo mismo.
 */
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
  /** Días posteriores a éste no se pueden elegir (por ejemplo, un pago futuro). */
  disabledAfter?: IsoDate
  /** Días anteriores a éste no se pueden elegir. */
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
