"use client"

import { CATEGORY_PALETTE, hueColor } from "@/lib/category-color"
import { cn } from "@/lib/utils"

/**
 * Selector de color por muestras (radios nativos): sin JavaScript de por medio
 * el valor viaja en el FormData, y el teclado (flechas) y el lector de pantalla
 * funcionan solos.
 */
export function ColorSwatchField({
  defaultValue,
  automaticLabel = "Automático",
  automaticHue = null,
}: {
  defaultValue: string | null
  automaticLabel?: string
  automaticHue?: number | null
}) {
  const options = [
    { key: "", label: automaticLabel, hue: automaticHue },
    ...CATEGORY_PALETTE,
  ]
  const current = CATEGORY_PALETTE.some((c) => c.key === defaultValue) ? defaultValue : ""

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs text-muted-foreground">Color</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.key || "auto"} className="relative cursor-pointer" title={o.label}>
            <input
              type="radio"
              name="color"
              value={o.key}
              defaultChecked={o.key === current}
              aria-label={o.label}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "flex size-9 items-center justify-center rounded-full border-2 border-transparent text-[10px] font-semibold",
                "peer-checked:border-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                o.hue === null && "border-border bg-muted",
              )}
              style={o.hue === null ? undefined : { backgroundColor: hueColor(o.hue) }}
            >
              {o.key === "" && (
                <span className={o.hue === null ? undefined : "text-background"}>A</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
