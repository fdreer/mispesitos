export type Breadcrumb = { href: string; label: string }

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  ingresos: "Ingresos",
  egresos: "Egresos",
  tarjetas: "Tarjetas",
  cambios: "Cambios",
  informes: "Informes",
  categorias: "Categorías",
  ajustes: "Ajustes",
  usuarios: "Usuarios",
}

/**
 * Convierte una ruta en migas de pan para el header.
 * Los segmentos desconocidos (ids dinámicos) se muestran como "Detalle";
 * la página puede reemplazar la última miga con `<PageTitle />`.
 */
export function buildBreadcrumbs(pathname: string): Breadcrumb[] {
  const segments = pathname.split("/").filter(Boolean)
  return segments.map((segment, i) => ({
    href: `/${segments.slice(0, i + 1).join("/")}`,
    label: SEGMENT_LABELS[segment] ?? "Detalle",
  }))
}
