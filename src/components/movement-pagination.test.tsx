// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { MovementPagination } from "@/components/movement-pagination"
import { parseMovementQuery } from "@/lib/movement-query"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}))

function montar(
  page: number,
  totalPages: number,
  raw: Record<string, string> = {},
  totalCount?: number,
) {
  return render(
    <MovementPagination
      basePath="/ingresos"
      query={parseMovementQuery(raw)}
      page={page}
      totalPages={totalPages}
      totalCount={totalCount}
    />,
  )
}

const href = (nombre: string) => screen.getByRole("link", { name: nombre }).getAttribute("href")

afterEach(cleanup)

describe("MovementPagination", () => {
  it("con una sola página no muestra nada", () => {
    expect(montar(1, 1).container.innerHTML).toBe("")
  })

  it("la página 1 no ofrece anterior y la última no ofrece siguiente", () => {
    montar(1, 3)
    expect(screen.queryByRole("link", { name: "Ir a la página anterior" })).toBeNull()
    expect(screen.getByRole("link", { name: "Ir a la página siguiente" })).toBeTruthy()

    cleanup()

    montar(3, 3)
    expect(screen.getByRole("link", { name: "Ir a la página anterior" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Ir a la página siguiente" })).toBeNull()
  })

  it("el texto visible en español sigue ahí, no sólo el aria-label (hallazgo F)", () => {
    montar(2, 3)

    expect(screen.getByRole("link", { name: "Ir a la página anterior" }).textContent).toContain(
      "Anterior",
    )
    expect(screen.getByRole("link", { name: "Ir a la página siguiente" }).textContent).toContain(
      "Siguiente",
    )
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

  it("en escritorio muestra el rango visible ('21–40 de 134')", () => {
    montar(2, 7, {}, 134)
    expect(screen.getByText("21–40 de 134")).toBeTruthy()
  })
})
