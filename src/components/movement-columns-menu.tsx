"use client"

import { ColumnsMenu } from "@/components/data-table/columns-menu"
import { useTablePrefs } from "@/hooks/use-table-prefs"
import type { ColumnId, MovementKind } from "@/lib/movement-columns"

/**
 * Menú "Columnas" de la tabla de movimientos. Vive fuera de la tabla (en la
 * barra de filtros) y comparte las preferencias con ella vía `localStorage`.
 */
export function MovementColumnsMenu({ kind }: { kind: MovementKind }) {
  const { columns, prefs, toggleHidden, reset } = useTablePrefs(kind)
  return (
    <ColumnsMenu
      columns={columns.map((c) => ({
        id: c.id,
        label: c.label,
        visible: !prefs.hidden.includes(c.id),
      }))}
      onToggle={(id) => toggleHidden(id as ColumnId)}
      onReset={reset}
    />
  )
}
