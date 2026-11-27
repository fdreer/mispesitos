"use client"

import { useId } from "react"
import { Wallet } from "lucide-react"

import { cardColor } from "@/lib/cards"
import { cn } from "@/lib/utils"

/**
 * El medio de pago del formulario de egresos: una pastilla por opción, en vez
 * del control segmentado. Cada pastilla mide lo que su nombre, así que con
 * varias tarjetas bajan de renglón sin desarmarse, y cada tarjeta lleva el
 * punto de su color (el mismo que en /tarjetas) para reconocerla de un vistazo.
 *
 * Por dentro siguen siendo radios nativos: el grupo se lee como "Medio de
 * pago" y las flechas recorren las opciones, igual que antes.
 */
export function PaymentMethodPills({
  value,
  onChange,
  cards,
}: {
  /** "" es efectivo/débito; si no, el id de la tarjeta. */
  value: string
  onChange: (next: string) => void
  cards: readonly { id: string; name: string; color: string | null }[]
}) {
  const name = useId()
  const options = [
    { id: "", name: "Efectivo / débito", color: null as string | null },
    ...cards.map((c) => ({ id: c.id, name: c.name, color: cardColor(c) })),
  ]

  return (
    <div role="radiogroup" aria-label="Medio de pago" className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label key={o.id || "cash"} className="relative cursor-pointer">
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
            className="peer sr-only"
          />
          <span
            className={cn(
              "flex h-8 max-w-56 items-center gap-2 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
              "border-white/[0.08] text-muted-foreground hover:border-white/15 hover:text-foreground",
              "peer-checked:border-transparent peer-checked:bg-paper peer-checked:text-void",
              "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
            )}
          >
            {o.color === null ? (
              <Wallet aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: o.color }}
              />
            )}
            <span className="truncate">{o.name}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
