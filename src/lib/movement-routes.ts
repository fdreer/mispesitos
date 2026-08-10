/**
 * Dónde vive la lista de cada tipo de movimiento. Vive acá, y no en cada
 * pantalla, porque el dashboard enlaza a las mismas rutas que las listas
 * usan para construir sus propios enlaces de filtro.
 */
export const BASE_PATHS: Record<"income" | "expense", string> = {
  income: "/ingresos",
  expense: "/egresos",
}
