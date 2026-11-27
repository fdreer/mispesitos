import type { ReactNode } from "react"

import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/** El color de la tarjeta como un chip chico, como una tarjeta física vista de canto. */
export function CardSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3.5 w-5 shrink-0 rounded-[3px]", className)}
      style={{ backgroundColor: color, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
    />
  )
}

/** Rótulo chico arriba de un dato. */
export function StatLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-muted-foreground flex items-center gap-1.5 text-xs", className)}>
      {children}
    </p>
  )
}

/**
 * Pesos y dólares sin mezclarlos: el principal grande, el otro debajo. Si
 * sólo hay dólares, los dólares pasan a ser el principal.
 */
export function MoneyStack({
  arsCents,
  usdCents,
  size = "lg",
  muted = false,
}: {
  arsCents: number
  usdCents: number
  size?: "xl" | "lg" | "md"
  muted?: boolean
}) {
  const onlyUsd = arsCents === 0 && usdCents > 0
  const main = onlyUsd ? formatMoney(usdCents, "USD") : formatMoney(arsCents, "ARS")
  const extra = !onlyUsd && usdCents > 0 ? formatMoney(usdCents, "USD") : null
  return (
    <div className="tabular-nums">
      <p
        className={cn(
          "whitespace-nowrap",
          size === "xl" ? "text-2xl" : size === "lg" ? "text-lg" : "text-sm",
          muted ? "text-muted-foreground" : "text-paper",
        )}
      >
        {main}
      </p>
      {extra && <p className="text-muted-foreground text-xs">+ {extra}</p>}
    </div>
  )
}

/**
 * Cuánto del límite está comprometido. La barra se pinta con el color de la
 * tarjeta y pasa a rojo si se superó.
 */
export function CreditUsage({
  limitCents,
  availableCents,
  unconvertedUsdCents,
  color,
}: {
  limitCents: number
  availableCents: number
  unconvertedUsdCents: number
  color: string
}) {
  const used = limitCents - availableCents
  const ratio = limitCents > 0 ? Math.min(Math.max(used / limitCents, 0), 1) : 0
  const over = availableCents < 0
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Disponible</span>
        <span className="tabular-nums">
          <span className={cn("font-medium", over ? "text-coral-red" : "text-foreground")}>
            {formatMoney(availableCents, "ARS", 0)}
          </span>
          <span className="text-muted-foreground"> de {formatMoney(limitCents, "ARS", 0)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label="Límite usado"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%`,
            backgroundColor: over ? "var(--color-coral-red)" : color,
          }}
        />
      </div>
      {unconvertedUsdCents > 0 && (
        <p className="text-muted-foreground text-xs">
          + {formatMoney(unconvertedUsdCents, "USD")} impagos sin convertir (no hay cotización)
        </p>
      )}
    </div>
  )
}
