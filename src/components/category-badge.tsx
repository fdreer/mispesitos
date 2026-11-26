import { Badge } from "@/components/ui/badge"
import { categoryHue, hueColor, hueTint } from "@/lib/category-color"
import { cn } from "@/lib/utils"

/**
 * El nombre de una categoría, con su color. Un solo componente para los
 * cuatro lugares donde aparece —la tabla de movimientos, el desplegable de
 * categoría de los filtros, su propio trigger, y la pantalla de categorías—
 * para que el mismo nombre no pueda salir de dos colores distintos.
 *
 * El color va por `style` y no por clase de Tailwind a propósito: sale del
 * color elegido o de un hash del nombre (ver @/lib/category-color), o sea de
 * datos que la persona escribió, y Tailwind sólo genera las clases que ve escritas en el código.
 * Una clase armada como `bg-[${color}]` no existiría en el CSS final.
 *
 * Sin `"use client"`: es markup puro, así que sirve igual en un componente de
 * servidor (la tabla) que adentro de uno de cliente (los filtros).
 */
export function CategoryBadge({
  name,
  parentName,
  hue,
  className,
}: {
  name: string
  /**
   * El padre, si es una subcategoría (Fase 2 del plan v2). Va adelante y
   * atenuado: "General" sola no dice nada cuando hay una en Hogar y otra en
   * Comida.
   */
  parentName?: string | null
  /**
   * El tono ya resuelto, con el color elegido y la herencia del padre (ver
   * `categoryLabels` en @/lib/category-tree). Sin él, sale del hash del
   * nombre, que es lo que tenían todas antes de poder elegir color.
   */
  hue?: number
  className?: string
}) {
  const tono = hue ?? categoryHue(name)
  return (
    <Badge
      variant="outline"
      className={cn("max-w-48", className)}
      style={{
        color: hueColor(tono),
        backgroundColor: hueTint(tono),
        borderColor: "transparent",
      }}
    >
      <span className="truncate">
        {parentName && <span className="opacity-70">{parentName} › </span>}
        {name}
      </span>
    </Badge>
  )
}
