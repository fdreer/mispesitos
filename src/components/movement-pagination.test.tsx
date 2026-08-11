// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { MovementPagination } from "@/components/movement-pagination"
import { parseMovementQuery } from "@/lib/movement-query"

/**
 * `next/link` fuera del server de Next busca el contexto del router y no lo
 * encuentra. Acá sólo importa el `href` que sale, así que un `<a>` alcanza.
 */
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function montar(page: number, totalPages: number, raw: Record<string, string> = {}) {
  return render(
    <MovementPagination
      basePath="/ingresos"
      query={parseMovementQuery(raw)}
      page={page}
      totalPages={totalPages}
    />,
  )
}

const href = (nombre: string) => screen.getByRole("link", { name: nombre }).getAttribute("href")

afterEach(cleanup)

describe("MovementPagination", () => {
  it("con una sola página no muestra nada", () => {
    // Sin jest-dom en el repo: se compara el HTML, no con toBeEmptyDOMElement.
    expect(montar(1, 1).container.innerHTML).toBe("")
  })

  it("la página 1 no ofrece anterior y la última no ofrece siguiente", () => {
    // `PaginationPrevious`/`PaginationNext` traen su propio `aria-label` (más
    // descriptivo que el texto visible, que además se oculta en pantallas
    // chicas), así que el nombre accesible real es ese, no "Anterior"/"Siguiente".
    montar(1, 3)
    expect(screen.queryByRole("link", { name: "Ir a la página anterior" })).toBeNull()
    expect(screen.getByRole("link", { name: "Ir a la página siguiente" })).toBeTruthy()

    cleanup()

    montar(3, 3)
    expect(screen.getByRole("link", { name: "Ir a la página anterior" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Ir a la página siguiente" })).toBeNull()
  })

  it("la página 1 no lleva ?page= en el enlace", () => {
    montar(2, 3)

    expect(href("1")).toBe("/ingresos")
    expect(href("3")).toBe("/ingresos?page=3")
  })

  it("los enlaces conservan los filtros puestos", () => {
    montar(1, 3, { search: "kiosco", status: "overdue" })

    expect(href("2")).toBe("/ingresos?search=kiosco&status=overdue&page=2")
  })

  it("marca la página actual para lectores de pantalla", () => {
    montar(2, 3)

    expect(screen.getByRole("link", { name: "2" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "1" }).getAttribute("aria-current")).toBeNull()
  })

  it("con muchas páginas muestra una ventana de 5 alrededor de la actual", () => {
    montar(10, 40)

    expect(screen.getAllByRole("link", { name: /^\d+$/ }).map((a) => a.textContent)).toEqual([
      "8",
      "9",
      "10",
      "11",
      "12",
    ])
  })

  it("la ventana no se sale por los bordes", () => {
    montar(1, 40)
    expect(screen.getAllByRole("link", { name: /^\d+$/ }).map((a) => a.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ])

    cleanup()

    montar(40, 40)
    expect(screen.getAllByRole("link", { name: /^\d+$/ }).map((a) => a.textContent)).toEqual([
      "36",
      "37",
      "38",
      "39",
      "40",
    ])
  })
})
