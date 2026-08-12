import { LinkPending } from "@/components/link-pending"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
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
 *
 * El primitivo (`ui/pagination.tsx`) es genérico e inglés por diseño — cada
 * `aria-label`/`text` por default se pisa acá con su versión en español,
 * porque son props normales que el primitivo reparte con `...props` después
 * del valor por default.
 */
export function MovementPagination({ basePath, query, page, totalPages }: Props) {
  if (totalPages <= 1) return null

  // La ventana se corre para no salirse por ninguno de los dos bordes: con
  // diez años de movimientos la lista completa de números no entra en pantalla.
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1))
  const end = Math.min(totalPages, start + WINDOW - 1)
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  return (
    <Pagination aria-label="Paginación">
      <PaginationContent>
        {page > 1 && (
          <PaginationItem>
            <PaginationPrevious
              href={buildMovementHref(basePath, query, { page: page - 1 })}
              text={<LinkPending>Anterior</LinkPending>}
              aria-label="Ir a la página anterior"
            />
          </PaginationItem>
        )}

        {pages.map((p) => (
          <PaginationItem key={p}>
            <PaginationLink href={buildMovementHref(basePath, query, { page: p })} isActive={p === page}>
              {/* Ver `LinkPending`: es la única forma que tiene esta pantalla
                  de avisar que el click ya se tomó sin dejar de ser un server
                  component. */}
              <LinkPending>{p}</LinkPending>
            </PaginationLink>
          </PaginationItem>
        ))}

        {page < totalPages && (
          <PaginationItem>
            <PaginationNext
              href={buildMovementHref(basePath, query, { page: page + 1 })}
              text={<LinkPending>Siguiente</LinkPending>}
              aria-label="Ir a la página siguiente"
            />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  )
}
