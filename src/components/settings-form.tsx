"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { CalendarIcon } from "lucide-react"
import { es } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { dateToIso, formatIsoForDisplay, isoToDate, type IsoDate } from "@/lib/dates"
import type { ActionResult } from "@/server/actions/result"
import { saveSettings } from "@/server/actions/settings"

type Props = {
  defaults: {
    initialBalanceArs: string
    initialBalanceUsd: string
    // `numeric` en Postgres llega como string por Drizzle (ver src/db/schema.ts):
    // este default es coherente con eso, no un number disfrazado.
    initialBalanceUsdRate: string
    initialBalanceDate: string
    preferredRate: string
  }
  redirectTo?: string
  submitLabel: string
}

export function SettingsForm({ defaults, redirectTo, submitLabel }: Props) {
  const router = useRouter()
  const [state, action, pending] = useActionState(saveSettings, null)
  const [initialBalanceDate, setInitialBalanceDate] = useState<IsoDate>(
    defaults.initialBalanceDate,
  )
  const [dateOpen, setDateOpen] = useState(false)

  /**
   * Si el "Guardado." sigue en pantalla. NO alcanza con mirar `state?.ok`: el
   * estado de `useActionState` vive hasta el próximo submit, así que guardar y
   * después editar cualquier campo dejaba el cartel verde al lado de un valor
   * sin guardar. En una app de finanzas es la señal equivocada sobre el campo
   * equivocado.
   *
   * Mismo patrón que el `handledState` de `MovementForm`: un ajuste de estado
   * durante el render disparado por el resultado de la Server Action, no un
   * efecto.
   */
  const [saved, setSaved] = useState(false)
  const [handledState, setHandledState] = useState<ActionResult | null>(null)
  if (state !== handledState) {
    setHandledState(state)
    setSaved(state?.ok === true)
  }

  /**
   * Cualquier cambio apaga el cartel. Los tres campos de texto lo avisan por
   * el `onChange` del form, que burbujea; el calendario y el Select no emiten
   * evento nativo de cambio, así que lo llaman a mano.
   */
  function markDirty() {
    setSaved(false)
  }

  useEffect(() => {
    if (state?.ok && redirectTo) {
      router.push(redirectTo)
      router.refresh()
    }
  }, [state, redirectTo, router])

  return (
    <form action={action} className="space-y-4" onChange={markDirty}>
      <div className="space-y-1.5">
        <Label htmlFor="initialBalanceArs">¿Cuántos pesos tenés hoy?</Label>
        <Input
          id="initialBalanceArs"
          name="initialBalanceArs"
          inputMode="decimal"
          defaultValue={defaults.initialBalanceArs}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="initialBalanceUsd">¿Y cuántos dólares?</Label>
        <Input
          id="initialBalanceUsd"
          name="initialBalanceUsd"
          inputMode="decimal"
          defaultValue={defaults.initialBalanceUsd}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="initialBalanceUsdRate">
          ¿A qué tipo de cambio promedio los compraste?
        </Label>
        <Input
          id="initialBalanceUsdRate"
          name="initialBalanceUsdRate"
          inputMode="decimal"
          defaultValue={defaults.initialBalanceUsdRate}
          required
        />
        <p className="text-muted-foreground text-xs">
          Pesos por dólar. Si no cargaste dólares, dejalo en 0.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="initialBalanceDate">¿Desde qué fecha?</Label>
        <input type="hidden" name="initialBalanceDate" value={initialBalanceDate} />
        {/* Mismo picker que el de /cambios (`exchange-form.tsx`), no el
            `<input type="date">` nativo: ese abre el calendario del sistema
            operativo, que no respeta el tema oscuro de la app. */}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              id="initialBalanceDate"
              type="button"
              variant="outline"
              // Mismo hallazgo D que en exchange-form.tsx: el <label
              // htmlFor> de arriba gana la resolución de nombre accesible y
              // corta ahí sin leer el contenido del botón.
              aria-label={`Desde qué fecha: ${formatIsoForDisplay(initialBalanceDate)}`}
              className="w-full justify-start font-normal"
            >
              <CalendarIcon />
              {formatIsoForDisplay(initialBalanceDate)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={es}
              required
              selected={isoToDate(initialBalanceDate)}
              defaultMonth={isoToDate(initialBalanceDate)}
              onSelect={(d) => {
                setInitialBalanceDate(dateToIso(d))
                setDateOpen(false)
                markDirty()
              }}
            />
          </PopoverContent>
        </Popover>
        <p className="text-muted-foreground text-xs">
          Los movimientos anteriores a esta fecha no afectan tu saldo.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="preferredRate">¿Qué dólar usás de referencia?</Label>
        {/* El div de más es el mismo truco que en la barra de filtros: en el
            HTML del servidor el Select de Radix deja un tercer hijo acá, y
            `space-y-1.5` se lo cobraba como 6px de aire de más hasta que
            hidrataba. Ver el comentario largo en `movement-filters.tsx`. */}
        <div>
          <Select
            name="preferredRate"
            defaultValue={defaults.preferredRate}
            onValueChange={markDirty}
          >
            <SelectTrigger id="preferredRate" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blue">Blue</SelectItem>
              <SelectItem value="oficial">Oficial</SelectItem>
              <SelectItem value="mep">MEP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}
      {/*
       * En /onboarding el éxito se ve porque la pantalla se va a /dashboard.
       * En /ajustes no hay `redirectTo`, así que sin esto guardar no producía
       * ninguna señal: el único feedback del formulario era el de error.
       *
       * Sale de `saved` y no de `state?.ok` para que se apague al primer
       * cambio: ver el comentario de arriba.
       */}
      {saved && !redirectTo && (
        <p className="text-pulse-green text-sm" role="status">
          Guardado.
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  )
}
