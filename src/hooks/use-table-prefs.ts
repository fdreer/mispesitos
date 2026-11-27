"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

import {
  clampWidth,
  columnsForKind,
  type ColumnDef,
  type ColumnId,
  type MovementKind,
} from "@/lib/movement-columns"

export type TablePrefs = {
  order: ColumnId[]
  hidden: ColumnId[]
  widths: Partial<Record<ColumnId, number>>
}

export function tablePrefsKey(kind: MovementKind): string {
  return `mispesitos.table.${kind}.v1`
}

export function defaultTablePrefs(kind: MovementKind): TablePrefs {
  const columns = columnsForKind(kind)
  return {
    order: columns.map((c) => c.id),
    hidden: columns.filter((c) => !c.defaultVisible).map((c) => c.id),
    widths: {},
  }
}

/**
 * Lee lo guardado en `localStorage` sin confiar en nada: descarta ids que no
 * son columnas de este tipo, duplicados y anchos que no son números, y agrega
 * al final del orden las columnas nuevas que el guardado no conocía.
 */
export function parseTablePrefs(raw: string | null, kind: MovementKind): TablePrefs {
  const defaults = defaultTablePrefs(kind)
  if (!raw) return defaults

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return defaults
  }
  if (!data || typeof data !== "object") return defaults

  const columns = columnsForKind(kind)
  const known = new Map(columns.map((c) => [c.id as string, c]))
  const obj = data as Record<string, unknown>

  const order: ColumnId[] = []
  if (Array.isArray(obj.order)) {
    for (const id of obj.order) {
      if (typeof id === "string" && known.has(id) && !order.includes(id as ColumnId)) {
        order.push(id as ColumnId)
      }
    }
  }
  for (const c of columns) if (!order.includes(c.id)) order.push(c.id)

  const hidden: ColumnId[] = Array.isArray(obj.hidden)
    ? [
        ...new Set(
          obj.hidden.filter((id): id is ColumnId => typeof id === "string" && known.has(id)),
        ),
      ]
    : defaults.hidden

  const widths: Partial<Record<ColumnId, number>> = {}
  if (obj.widths && typeof obj.widths === "object") {
    for (const [id, w] of Object.entries(obj.widths as Record<string, unknown>)) {
      const def = known.get(id)
      if (def && typeof w === "number" && Number.isFinite(w)) widths[def.id] = clampWidth(def, w)
    }
  }

  return { order, hidden, widths }
}

// --- Store sobre localStorage -------------------------------------------------

const listeners = new Set<() => void>()
const cache = new Map<string, { raw: string | null; prefs: TablePrefs }>()
const serverDefaults = new Map<MovementKind, TablePrefs>()

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("mispesitos.table.")) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function snapshot(kind: MovementKind): TablePrefs {
  const key = tablePrefsKey(kind)
  const raw = readRaw(key)
  const hit = cache.get(key)
  if (hit && hit.raw === raw) return hit.prefs
  const prefs = parseTablePrefs(raw, kind)
  cache.set(key, { raw, prefs })
  return prefs
}

function serverSnapshot(kind: MovementKind): TablePrefs {
  let prefs = serverDefaults.get(kind)
  if (!prefs) {
    prefs = defaultTablePrefs(kind)
    serverDefaults.set(kind, prefs)
  }
  return prefs
}

function write(kind: MovementKind, prefs: TablePrefs | null) {
  const key = tablePrefsKey(kind)
  try {
    if (prefs === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(prefs))
  } catch {
    // Sin localStorage (modo privado lleno, etc.): la preferencia no persiste.
  }
  for (const l of listeners) l()
}

/**
 * Preferencias de la tabla de movimientos por tipo (orden, columnas ocultas y
 * anchos), guardadas en `localStorage`. En el servidor y durante la
 * hidratación devuelve los defaults, así el HTML coincide.
 */
export function useTablePrefs(kind: MovementKind) {
  const prefs = useSyncExternalStore(
    subscribe,
    () => snapshot(kind),
    () => serverSnapshot(kind),
  )

  const update = useCallback(
    (fn: (prev: TablePrefs) => TablePrefs) => write(kind, fn(snapshot(kind))),
    [kind],
  )

  const columns = useMemo(() => {
    const byId = new Map(columnsForKind(kind).map((c) => [c.id, c]))
    return prefs.order.map((id) => byId.get(id)).filter((c): c is ColumnDef => Boolean(c))
  }, [kind, prefs.order])

  const visibleColumns = useMemo(
    () => columns.filter((c) => !prefs.hidden.includes(c.id)),
    [columns, prefs.hidden],
  )

  const widthOf = useCallback(
    (c: ColumnDef) => prefs.widths[c.id] ?? c.defaultWidth,
    [prefs.widths],
  )

  const setWidth = useCallback(
    (id: ColumnId, width: number) =>
      update((p) => {
        const def = columnsForKind(kind).find((c) => c.id === id)
        if (!def) return p
        return { ...p, widths: { ...p.widths, [id]: clampWidth(def, width) } }
      }),
    [kind, update],
  )

  const toggleHidden = useCallback(
    (id: ColumnId) =>
      update((p) => {
        const hidden = p.hidden.includes(id) ? p.hidden.filter((h) => h !== id) : [...p.hidden, id]
        // Siempre queda al menos una columna visible.
        if (hidden.length >= p.order.length) return p
        return { ...p, hidden }
      }),
    [update],
  )

  /** Mueve `id` para que quede antes de `beforeId` (o al final si es null). */
  const moveColumn = useCallback(
    (id: ColumnId, beforeId: ColumnId | null) =>
      update((p) => {
        if (id === beforeId) return p
        const order = p.order.filter((c) => c !== id)
        const at = beforeId === null ? order.length : order.indexOf(beforeId)
        order.splice(at < 0 ? order.length : at, 0, id)
        return { ...p, order }
      }),
    [update],
  )

  const reset = useCallback(() => write(kind, null), [kind])

  return { prefs, columns, visibleColumns, widthOf, setWidth, toggleHidden, moveColumn, reset }
}

export type TablePrefsApi = ReturnType<typeof useTablePrefs>
