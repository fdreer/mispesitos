import type { MovementSort } from "@/lib/movement-list-view"

export type MovementKind = "income" | "expense"

export type ColumnId =
  | "date"
  | "description"
  | "category"
  | "paymentMethod"
  | "installments"
  | "nextDue"
  | "amount"
  | "status"

export type ColumnDef = {
  id: ColumnId
  label: string
  defaultWidth: number
  minWidth: number
  /** Orden del servidor que dispara clickear el encabezado. */
  sortKey?: MovementSort
  align: "left" | "right"
  kinds: readonly MovementKind[]
  defaultVisible: boolean
}

const BOTH: readonly MovementKind[] = ["income", "expense"]

/**
 * Columnas de la tabla de movimientos (escritorio). El chevron y las acciones
 * no están acá: son fijas, no se reordenan ni se ocultan.
 *
 * "Cuotas" y "Próx. vencimiento" arrancan ocultas: mientras lo estén, su dato
 * vuelve como subtítulo de la descripción, que es como se leía antes.
 */
export const MOVEMENT_COLUMNS: readonly ColumnDef[] = [
  { id: "date", label: "Fecha", defaultWidth: 112, minWidth: 88, sortKey: "date", align: "left", kinds: BOTH, defaultVisible: true },
  { id: "description", label: "Descripción", defaultWidth: 280, minWidth: 140, sortKey: "description", align: "left", kinds: BOTH, defaultVisible: true },
  { id: "category", label: "Categoría", defaultWidth: 180, minWidth: 110, sortKey: "category", align: "left", kinds: BOTH, defaultVisible: true },
  { id: "paymentMethod", label: "Medio de pago", defaultWidth: 150, minWidth: 100, align: "left", kinds: ["expense"], defaultVisible: true },
  { id: "installments", label: "Cuotas", defaultWidth: 96, minWidth: 72, align: "left", kinds: BOTH, defaultVisible: false },
  { id: "nextDue", label: "Próx. vencimiento", defaultWidth: 170, minWidth: 120, sortKey: "due", align: "left", kinds: BOTH, defaultVisible: false },
  { id: "amount", label: "Importe", defaultWidth: 140, minWidth: 96, sortKey: "amount", align: "right", kinds: BOTH, defaultVisible: true },
  { id: "status", label: "Estado", defaultWidth: 150, minWidth: 110, sortKey: "due", align: "left", kinds: BOTH, defaultVisible: true },
]

/** Ancho fijo del chevron y mínimo de la columna de acciones. */
export const CHEVRON_WIDTH = 32
export const ACTIONS_MIN_WIDTH = 120
export const MAX_COLUMN_WIDTH = 640

export function columnsForKind(kind: MovementKind): ColumnDef[] {
  return MOVEMENT_COLUMNS.filter((c) => c.kinds.includes(kind))
}

export function columnById(id: ColumnId): ColumnDef {
  const found = MOVEMENT_COLUMNS.find((c) => c.id === id)
  if (!found) throw new Error(`Columna desconocida: ${id}`)
  return found
}

export function clampWidth(def: ColumnDef, width: number): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(def.minWidth, width)))
}
