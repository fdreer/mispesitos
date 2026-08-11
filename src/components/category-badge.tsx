import { Badge } from "@/components/ui/badge"
import { categoryColor, categoryTint } from "@/lib/category-color"
import { cn } from "@/lib/utils"

/**
 * El nombre de una categoría, con su color. Un solo componente para los
 * cuatro lugares donde aparece —la tabla de movimientos, el desplegable de
 * categoría de los filtros, su propio trigger, y la pantalla de categorías—
 * para que el mismo nombre no pueda salir de dos colores distintos.
 *
 * El color va por `style` y no por clase de Tailwind a propósito: sale de un
 * hash del nombre (ver @/lib/category-color), o sea de datos que la persona
 * escribió, y Tailwind sólo genera las clases que ve escritas en el código.
 * Una clase armada como `bg-[${color}]` no existiría en el CSS final.
 *
 * Sin `"use client"`: es markup puro, así que sirve igual en un componente de
 * servidor (la tabla) que adentro de uno de cliente (los filtros).
 */
export function CategoryBadge({ name, className }: { name: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("max-w-40 truncate", className)}
      style={{
        color: categoryColor(name),
        backgroundColor: categoryTint(name),
        borderColor: "transparent",
      }}
    >
      {name}
    </Badge>
  )
}
