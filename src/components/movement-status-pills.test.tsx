// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { MovementStatusPills, MovementTotalsBar } from "@/components/movement-status-pills"
import { parseMovementQuery } from "@/lib/movement-query"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}))

afterEach(cleanup)

describe("MovementStatusPills", () => {
  it("muestra Todos, Vencidos (n), Pendientes (n) y Pagados con enlaces que conservan los filtros", () => {
    render(
      <MovementStatusPills
        basePath="/egresos"
        query={parseMovementQuery({ search: "alquiler", status: "overdue" }, "due")}
        defaultSort="due"
        counts={{ all: 12, overdue: 3, pending: 8, paid: 1 }}
      />,
    )

    const todos = screen.getByRole("link", { name: "Todos" })
    const vencidos = screen.getByRole("link", { name: "Vencidos (3)" })
    const pendientes = screen.getByRole("link", { name: "Pendientes (8)" })
    const pagados = screen.getByRole("link", { name: "Pagados" })

    expect(todos.getAttribute("href")).toBe("/egresos?search=alquiler")
    expect(vencidos.getAttribute("href")).toBe("/egresos?search=alquiler&status=overdue")
    expect(vencidos.getAttribute("aria-current")).toBe("page")
    expect(pendientes.getAttribute("href")).toBe("/egresos?search=alquiler&status=pending")
    expect(pagados.getAttribute("href")).toBe("/egresos?search=alquiler&status=paid")
  })
})

describe("MovementTotalsBar", () => {
  it("muestra los totales de Pendiente, Vencido y Pagado con formato argentino", () => {
    render(
      <MovementTotalsBar
        totals={{
          pending: { arsCents: 150_000_00, usdCents: 0 },
          overdue: { arsCents: 20_000_00, usdCents: 50_00 },
          paid: { arsCents: 0, usdCents: 100_00 },
        }}
      />,
    )

    const text = (screen.getByLabelText("Totales del filtro").textContent ?? "").replace(/\u00a0/g, " ")
    expect(text).toContain("Pendiente:")
    expect(text).toContain("$ 150.000,00")
    expect(text).toContain("Vencido:")
    expect(text).toContain("$ 20.000,00 + US$ 50,00")
    expect(text).toContain("Pagado:")
    expect(text).toContain("US$ 100,00")
  })
})
