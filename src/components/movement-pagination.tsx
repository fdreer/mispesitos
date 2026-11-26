import { LinkPending } from "@/components/link-pending"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import type { MovementSort } from "@/lib/movement-list-view"
import { buildMovementHref, PAGE_SIZE, type MovementQuery } from "@/lib/movement-query"

const WINDOW = 5

type Props = {
  basePath: string
  query: MovementQuery
  defaultSort?: MovementSort
  page: number
  totalPages: number
  totalCount?: number
}

export function MovementPagination({
  basePath,
  query,
  defaultSort = "date",
  page,
  totalPages,
  totalCount,
}: Props) {
  if (totalCount !== undefined && totalCount === 0) return null
  if (totalCount === undefined && totalPages <= 1) return null

  const startItem = (page - 1) * PAGE_SIZE + 1
  const endItem =
    totalCount !== undefined ? Math.min(page * PAGE_SIZE, totalCount) : page * PAGE_SIZE

  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1))
  const end = Math.min(totalPages, start + WINDOW - 1)
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  return (
    <div
      className={
        totalCount !== undefined
          ? "hidden items-center justify-between gap-4 md:flex"
          : "flex items-center justify-center"
      }
    >
      {totalCount !== undefined && (
        <p className="text-muted-foreground text-xs tabular-nums">
          {startItem}–{endItem} de {totalCount}
        </p>
      )}
      {totalPages > 1 && (
        <Pagination aria-label="Paginación" className={totalCount !== undefined ? "mx-0 w-auto" : undefined}>
          <PaginationContent>
            {page > 1 && (
              <PaginationItem>
                <PaginationPrevious
                  href={buildMovementHref(basePath, query, { page: page - 1 }, defaultSort)}
                  text={<LinkPending>Anterior</LinkPending>}
                  aria-label="Ir a la página anterior"
                />
              </PaginationItem>
            )}

            {pages.map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  href={buildMovementHref(basePath, query, { page: p }, defaultSort)}
                  isActive={p === page}
                >
                  <LinkPending>{p}</LinkPending>
                </PaginationLink>
              </PaginationItem>
            ))}

            {page < totalPages && (
              <PaginationItem>
                <PaginationNext
                  href={buildMovementHref(basePath, query, { page: page + 1 }, defaultSort)}
                  text={<LinkPending>Siguiente</LinkPending>}
                  aria-label="Ir a la página siguiente"
                />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
