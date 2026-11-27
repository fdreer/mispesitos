"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { DateField } from "@/components/date-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import type { ActionResult } from "@/server/actions/result"
import { saveSettings } from "@/server/actions/settings"

type Props = {
  defaults: {
    initialBalanceArs: string
    initialBalanceUsd: string
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

  const [saved, setSaved] = useState(false)
  const [handledState, setHandledState] = useState<ActionResult | null>(null)
  if (state !== handledState) {
    setHandledState(state)
    setSaved(state?.ok === true)
  }

  function markDirty() {
    setSaved(false)
  }

  useEffect(() => {
    if (state?.ok && redirectTo) {
      router.push(redirectTo)
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
        <Label htmlFor="initialBalanceDate">¿Desde qué fecha?</Label>
        <DateField
          id="initialBalanceDate"
          hiddenName="initialBalanceDate"
          value={initialBalanceDate}
          onChange={(next) => {
            setInitialBalanceDate(next)
            markDirty()
          }}
          ariaLabel={`Desde qué fecha: ${formatIsoForDisplay(initialBalanceDate)}`}
          className="w-full justify-start font-normal"
        />
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
        <p className="text-muted-foreground text-xs">
          Sólo se usa para precargar el tipo de cambio cuando registrás una compra o venta de dólares.
        </p>
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
