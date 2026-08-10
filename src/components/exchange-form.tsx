"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { todayInAr } from "@/lib/dates"
import { createExchange } from "@/server/actions/movements"

type Props = { buyRate: number | null; sellRate: number | null }

export function ExchangeForm({ buyRate, sellRate }: Props) {
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

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          aria-pressed={direction === "buy"}
          onClick={() => setDirection("buy")}
          className={
            direction === "buy"
              ? // El hover de `outline` pisa el relleno y la etiqueta del estado
                // elegido, así que el elegido repite los suyos en hover.
                "bg-accent text-paper hover:bg-accent hover:text-paper"
              : "text-fog"
          }
        >
          Comprar dólares
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-pressed={direction === "sell"}
          onClick={() => setDirection("sell")}
          className={
            direction === "sell"
              ? "bg-accent text-paper hover:bg-accent hover:text-paper"
              : "text-fog"
          }
        >
          Vender dólares
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="date">Fecha</Label>
          <Input id="date" name="date" type="date" defaultValue={todayInAr()} required />
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
