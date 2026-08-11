import Link from "next/link"

import { Button } from "@/components/ui/button"
import { buildMovementHref, type MovementQuery } from "@/lib/movement-query"

/** Cuántos números se muestran alrededor de la página actual. */
const WINDOW = 5

type Props = {
  /** Ruta de la pantalla actual ("/ingresos" o "/egresos"), sin query. */
  basePath: string
  query: MovementQuery
  /** La página que se está mostrando de verdad, ya ajustada por `paginate`. */
  page: number
  totalPages: number
}

/**
 * Enlaces, no botones: la página vive en la URL igual que los filtros, así que
 * paginar es navegar. Mismo patrón que el resto de la pantalla, y de paso
 * funciona con el botón Atrás y con abrir en una pestaña nueva.
 */
export function MovementPagination({ basePath, query, page, totalPages }: Props) {
  if (totalPages <= 1) return null

  // La ventana se corre para no salirse por ninguno de los dos bordes: con
  // diez años de movimientos la lista completa de números no entra en pantalla.
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1))
  const end = Math.min(totalPages, start + WINDOW - 1)
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  return (
    <nav aria-label="Paginación" className="flex items-center justify-center gap-1">
      {page > 1 && (
        <Button asChild size="sm" variant="ghost">
          <Link href={buildMovementHref(basePath, query, { page: page - 1 })}>Anterior</Link>
        </Button>
      )}

      {pages.map((p) => (
        <Button key={p} asChild size="sm" variant={p === page ? "secondary" : "ghost"}>
          <Link
            href={buildMovementHref(basePath, query, { page: p })}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Link>
        </Button>
      ))}

      {page < totalPages && (
        <Button asChild size="sm" variant="ghost">
          <Link href={buildMovementHref(basePath, query, { page: page + 1 })}>Siguiente</Link>
        </Button>
      )}
    </nav>
  )
}
