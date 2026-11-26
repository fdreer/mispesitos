/**
 * Helpers puros para la navegación compartida entre el riel de escritorio y la
 * barra inferior móvil (§5.4 y decisión §7.6 del plan v2).
 */

/** Rutas que viven dentro de la hoja "Más" en la barra inferior móvil. */
export const MORE_NAV_HREFS = [
  "/tarjetas",
  "/informes",
  "/cambios",
  "/categorias",
  "/ajustes",
] as const

/**
 * Marca una ruta como activa tanto en coincidencia exacta como en subrutas
 * (por ejemplo `/tarjetas/<id>` mantiene activo `/tarjetas` en escritorio y
 * "Más" en móvil).
 */
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
