"use client"

import { Columns3, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type ColumnsMenuItem = { id: string; label: string; visible: boolean }

/** Mostrar u ocultar columnas, y volver a la configuración original. */
export function ColumnsMenu({
  columns,
  onToggle,
  onReset,
}: {
  columns: ColumnsMenuItem[]
  onToggle: (id: string) => void
  onReset: () => void
}) {
  const visibleCount = columns.filter((c) => c.visible).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground">
          <Columns3 />
          Columnas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Columnas visibles
        </DropdownMenuLabel>
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={c.visible}
            disabled={c.visible && visibleCount <= 1}
            onCheckedChange={() => onToggle(c.id)}
            onSelect={(e) => e.preventDefault()}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReset}>
          <RotateCcw />
          Restablecer columnas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
