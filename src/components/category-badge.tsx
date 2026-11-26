import { Badge } from "@/components/ui/badge"
import { categoryHue, hueColor, hueTint } from "@/lib/category-color"
import { cn } from "@/lib/utils"

export function CategoryBadge({
  name,
  parentName,
  hue,
  className,
}: {
  name: string
  parentName?: string | null
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
