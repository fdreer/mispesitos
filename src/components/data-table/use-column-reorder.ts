"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const DRAG_THRESHOLD_PX = 5

type DragState<Id extends string> = {
  id: Id
  /** Columna delante de la cual caería; null = al final. */
  beforeId: Id | null
}

/**
 * Reordenar columnas arrastrando el encabezado, con pointer events propios.
 * Hasta que el puntero no se mueve unos píxeles es un click (ordena); pasado
 * ese umbral es un arrastre y el click siguiente se ignora. Esc cancela.
 */
export function useColumnReorder<Id extends string>({
  ids,
  onMove,
}: {
  ids: readonly Id[]
  onMove: (id: Id, beforeId: Id | null) => void
}) {
  const [drag, setDrag] = useState<DragState<Id> | null>(null)
  const ignoreClickUntil = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  const start = useCallback(
    (e: React.PointerEvent<HTMLTableCellElement>, id: Id) => {
      if (e.button !== 0 || e.pointerType === "touch") return
      const row = e.currentTarget.closest("tr")
      if (!row) return
      const startX = e.clientX
      let active = false
      let current: DragState<Id> | null = null

      function targetFor(clientX: number): Id | null {
        const ths = [...row!.querySelectorAll<HTMLElement>("th[data-col]")]
        for (const th of ths) {
          const rect = th.getBoundingClientRect()
          if (clientX < rect.left + rect.width / 2) return th.dataset.col as Id
        }
        return null
      }

      function onMoveEv(ev: PointerEvent) {
        if (!active) {
          if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD_PX) return
          active = true
          document.body.style.cursor = "grabbing"
        }
        ev.preventDefault()
        current = { id, beforeId: targetFor(ev.clientX) }
        setDrag(current)
      }

      function finish(commit: boolean) {
        cleanupRef.current?.()
        if (active) {
          ignoreClickUntil.current = Date.now() + 250
          if (commit && current) {
            const { beforeId } = current
            const idx = ids.indexOf(id)
            const noOp = beforeId === id || (beforeId !== null && ids[idx + 1] === beforeId) ||
              (beforeId === null && idx === ids.length - 1)
            if (!noOp) onMove(id, beforeId)
          }
        }
        setDrag(null)
      }

      const onUp = () => finish(true)
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") finish(false)
      }

      window.addEventListener("pointermove", onMoveEv)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
      window.addEventListener("keydown", onKey)
      cleanupRef.current = () => {
        window.removeEventListener("pointermove", onMoveEv)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
        window.removeEventListener("keydown", onKey)
        document.body.style.cursor = ""
        cleanupRef.current = null
      }
    },
    [ids, onMove],
  )

  const shouldIgnoreClick = useCallback(() => Date.now() < ignoreClickUntil.current, [])

  /** Dónde dibujar la marca de inserción para la columna `id`. */
  const indicatorFor = useCallback(
    (id: Id): "before" | "after" | null => {
      if (!drag) return null
      if (drag.beforeId === id) return "before"
      if (drag.beforeId === null && ids[ids.length - 1] === id) return "after"
      return null
    },
    [drag, ids],
  )

  return { draggingId: drag?.id ?? null, start, shouldIgnoreClick, indicatorFor }
}
