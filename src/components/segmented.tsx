"use client"

import { useId } from "react"

import { cn } from "@/lib/utils"

/**
 * Un control segmentado (§5.2 del plan v2: "Moneda como segmentado ARS |
 * USD", "Ya lo pagué / Lo voy a pagar") hecho con radios nativos.
 *
 * Radios y no botones con `aria-pressed`: un grupo de opciones excluyentes ES
 * un radiogroup, y con radios nativos las flechas del teclado, el foco y lo
 * que anuncia un lector de pantalla salen solos, sin reimplementarlos. Es el
 * mismo recurso que los colores de /categorias (`ColorField`).
 *
 * Controlado: el valor vive en el formulario que lo usa, que casi siempre
 * necesita reaccionar al cambio (ocultar las cuotas, el campo de TC…). Si
 * lleva `name`, además viaja en el FormData.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  name,
  className,
  size = "default",
  wrap = false,
}: {
  /** El nombre accesible del grupo. */
  label: string
  value: T
  onChange: (next: T) => void
  options: readonly { value: T; label: React.ReactNode; ariaLabel?: string }[]
  name?: string
  className?: string
  size?: "default" | "sm"
  /**
   * Para listas de largo variable (el medio de pago, con una opción por
   * tarjeta): las opciones toman su ancho y bajan de línea en vez de
   * achicarse hasta cortar el nombre.
   */
  wrap?: boolean
}) {
  const groupName = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex w-full rounded-lg border border-input bg-muted/30 p-0.5",
        wrap && "flex-wrap gap-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={cn("relative cursor-pointer", wrap ? "flex-auto" : "min-w-0 flex-1")}
        >
          <input
            type="radio"
            name={name ?? groupName}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            aria-label={o.ariaLabel}
            className="peer sr-only"
          />
          <span
            className={cn(
              "flex items-center justify-center rounded-md px-2 text-center text-sm font-medium text-muted-foreground transition-colors",
              size === "sm" ? "h-8" : "h-10",
              "peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm",
              "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </div>
  )
}
