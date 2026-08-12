"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { IsoDate } from "@/lib/dates"
import { createExchange } from "@/server/actions/movements"

type Props = {
  buyRate: number | null
  sellRate: number | null
  /** Hoy según el reloj de Buenos Aires, calculado en el servidor. */
  today: IsoDate
}

export function ExchangeForm({ buyRate, sellRate, today }: Props) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createExchange, null)
  const [direction, setDirection] = useState<"buy" | "sell">("buy")

  const suggested = direction === "buy" ? buyRate : sellRate

  useEffect(() => {
    if (state?.ok) router.refresh()
  }, [state, router])

  return (
    <form action={action} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="direction" value={direction} />

      {/*
        El mismo segmentado que el filtro de estado de /ingresos y /egresos, y
        no dos botones con `aria-pressed` a mano: son dos opciones excluyentes
        —exactamente lo que `ToggleGroup type="single"` modela— y la versión
        anterior tenía que repetir sus propios colores en hover para que el
        `outline` no le pisara el estado elegido.

        `value` nunca puede quedar vacío: Radix manda "" al clickear el que ya
        está activo, y acá eso no es "ninguno de los dos" sino "no cambiar" —
        una operación es compra o venta, no puede no ser ninguna.
      */}
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
          <Input id="date" name="date" type="date" defaultValue={today} required />
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
