"use client"

import { useRef } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { cn } from "@/lib/utils"

export type SortDirection = "asc" | "desc"

type Props = {
  id: string
  label: string
  width: number
  minWidth: number
  align?: "left" | "right"
  /** Sentido actual si la tabla está ordenada por esta columna. */
  sorted?: SortDirection | null
  onSort?: () => void
  /** Ancho en vivo mientras se arrastra el borde (no persiste). */
  onResize: (width: number) => void
  /** Ancho final al soltar o al autoajustar (persiste). */
  onResizeEnd: (width: number) => void
  /** Doble click en el borde: ajustar al contenido. */
  onAutoFit: () => void
  /** Pointer down sobre el encabezado: posible inicio de arrastre para reordenar. */
  onDragStart?: (e: React.PointerEvent<HTMLTableCellElement>) => void
  /** Alt+Shift+← / → para mover la columna con teclado. */
  onMoveBy?: (delta: -1 | 1) => void
  /** Click que hay que ignorar porque terminó un arrastre. */
  shouldIgnoreClick?: () => boolean
  dragging?: boolean
  dropIndicator?: "before" | "after" | null
}

/**
 * Encabezado de columna estilo ClickUp: click ordena, el borde derecho
 * redimensiona (doble click autoajusta) y arrastrar el encabezado lo reordena.
 */
export function ColumnHeader({
  id,
  label,
  width,
  minWidth,
  align = "left",
  sorted = null,
  onSort,
  onResize,
  onResizeEnd,
  onAutoFit,
  onDragStart,
  onMoveBy,
  shouldIgnoreClick,
  dragging = false,
  dropIndicator = null,
}: Props) {
  const resizeStart = useRef<{ x: number; width: number } | null>(null)
  const liveWidth = useRef(width)

  function handleResizeDown(e: React.PointerEvent<HTMLSpanElement>) {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    resizeStart.current = { x: e.clientX, width }
    liveWidth.current = width
  }

  function handleResizeMove(e: React.PointerEvent<HTMLSpanElement>) {
    const start = resizeStart.current
    if (!start) return
    const next = Math.max(minWidth, start.width + e.clientX - start.x)
    liveWidth.current = next
    onResize(next)
  }

  function handleResizeUp(e: React.PointerEvent<HTMLSpanElement>) {
    if (!resizeStart.current) return
    resizeStart.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    onResizeEnd(liveWidth.current)
  }

  const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown
  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"

  return (
    <th
      data-slot="table-head"
      data-col={id}
      scope="col"
      aria-sort={onSort ? ariaSort : undefined}
      onPointerDown={onDragStart}
      className={cn(
        "group/th relative h-9 select-none px-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground",
        onDragStart && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        dropIndicator === "before" &&
          "before:absolute before:inset-y-1 before:-left-px before:w-0.5 before:rounded-full before:bg-primary",
        dropIndicator === "after" &&
          "after:absolute after:inset-y-1 after:-right-px after:z-10 after:w-0.5 after:rounded-full after:bg-primary",
      )}
    >
      <div className={cn("flex min-w-0 items-center", align === "right" && "justify-end")}>
        {onSort ? (
          <button
            type="button"
            onClick={() => {
              if (shouldIgnoreClick?.()) return
              onSort()
            }}
            onKeyDown={(e) => {
              if (e.altKey && e.shiftKey && onMoveBy) {
                if (e.key === "ArrowLeft") {
                  e.preventDefault()
                  onMoveBy(-1)
                } else if (e.key === "ArrowRight") {
                  e.preventDefault()
                  onMoveBy(1)
                }
              }
            }}
            aria-keyshortcuts={onMoveBy ? "Alt+Shift+ArrowLeft Alt+Shift+ArrowRight" : undefined}
            className={cn(
              "-mx-1 inline-flex min-w-0 cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              sorted && "text-foreground",
              align === "right" && "flex-row-reverse",
            )}
          >
            <span className="truncate">{label}</span>
            <SortIcon
              aria-hidden
              className={cn(
                "size-3 shrink-0 transition-opacity",
                sorted ? "opacity-100" : "opacity-0 group-hover/th:opacity-60",
              )}
            />
          </button>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </div>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Redimensionar ${label}`}
        title="Arrastrá para redimensionar · doble click para ajustar"
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        onPointerCancel={handleResizeUp}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onAutoFit()
        }}
        className="absolute top-0 -right-0.5 z-20 flex h-full w-1.5 cursor-col-resize touch-none justify-center"
      >
        <span className="h-full w-px bg-transparent transition-colors group-hover/th:bg-white/[0.08] hover:!bg-primary" />
      </span>
    </th>
  )
}
