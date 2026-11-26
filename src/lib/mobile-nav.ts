export const MORE_NAV_HREFS = [
  "/tarjetas",
  "/informes",
  "/cambios",
  "/categorias",
  "/ajustes",
] as const

export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Devuelve true si la pantalla actual pertenece al menú "Más" de móvil. */
export function isMoreMenuActive(pathname: string): boolean {
  return MORE_NAV_HREFS.some((href) => isRouteActive(pathname, href))
}

/**
 * Tipo por defecto al abrir la carga rápida desde el botón "+" de la barra
 * inferior: si la persona ya está en `/ingresos` arranca en ingreso; en el
 * resto de las pantallas arranca en egreso, que es la operación más frecuente.
 */
export function defaultQuickAddKind(pathname: string): "income" | "expense" {
  return isRouteActive(pathname, "/ingresos") ? "income" : "expense"
}

export const QUICK_ADD_EVENT = "mis-pesitos:quick-add"

/** Dispara la apertura de la hoja de carga rápida desde el botón "+" móvil. */
export function openQuickAddSheet() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(QUICK_ADD_EVENT))
}
