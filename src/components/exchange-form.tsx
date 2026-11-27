"use client"

import { useActionState, useState } from "react"
import { toast } from "sonner"

import { DateField } from "@/components/date-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useActionSuccess } from "@/hooks/use-action-success"
import { formatIsoForDisplay, type IsoDate } from "@/lib/dates"
import { createExchange } from "@/server/actions/movements"

type Props = {
  buyRate: number | null
  sellRate: number | null
  today: IsoDate
}

export function ExchangeForm({ buyRate, sellRate, today }: Props) {
  const [state, action, pending] = useActionState(createExchange, null)
  const [direction, setDirection] = useState<"buy" | "sell">("buy")
  const [date, setDate] = useState<IsoDate>(today)

  const suggested = direction === "buy" ? buyRate : sellRate

  useActionSuccess(state, () => {
    toast.success("Cambio registrado")
  })

  return (
    <form action={action} className="max-w-lg space-y-4 rounded-lg border p-4">
      <input type="hidden" name="direction" value={direction} />

      <ToggleGroup
        type="single"
        spacing={0}
        variant="outline"
        value={direction}
        onValueChange={(v) => v && setDirection(v as "buy" | "sell")}
        aria-label="Sentido de la operación"
      >
        <ToggleGroupItem value="buy" className="data-[state=on]:text-paper">
          Comprar dólares
        </ToggleGroupItem>
        <ToggleGroupItem value="sell" className="data-[state=on]:text-paper">
          Vender dólares
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="date">Fecha</Label>
          <DateField
            id="date"
            hiddenName="date"
            value={date}
            onChange={setDate}
            ariaLabel={`Fecha: ${formatIsoForDisplay(date)}`}
            className="w-full justify-start font-normal"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="usdCents">Dólares</Label>
          <Input id="usdCents" name="usdCents" inputMode="decimal" required />
        </div>

        <div className="space-y-1">
          <Label htmlFor="rate">Tipo de cambio</Label>
          {/* key fuerza el remonte para que el sugerido cambie al alternar. */}
          <Input
            key={direction}
            id="rate"
            name="rate"
            inputMode="decimal"
            defaultValue={suggested ?? ""}
            required
          />
        </div>
      </div>

      {!suggested && (
        <p className="text-muted-foreground text-xs">
          No pudimos traer la cotización. Escribila a mano.
        </p>
      )}

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Registrar operación"}
      </Button>
    </form>
  )
}
