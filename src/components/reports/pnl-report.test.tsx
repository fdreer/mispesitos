// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { PnlReport } from "@/components/reports/pnl-report"
import { parseMovementQuery } from "@/lib/movement-query"
import { buildPnlReport, type ReportCategory } from "@/lib/reports-pnl"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(cleanup)

const CATS: ReportCategory[] = [
  { id: "sueldo", name: "Sueldo", kind: "income", parentId: null, archived: false, color: null },
  { id: "hogar", name: "Hogar", kind: "expense", parentId: null, archived: false, color: null },
  { id: "alquiler", name: "Alquiler", kind: "expense", parentId: "hogar", archived: false, color: null },
  { id: "expensas", name: "Expensas", kind: "expense", parentId: "hogar", archived: false, color: null },
]

describe("PnlReport", () => {
  it("muestra tarjetas resumen, filas padre desplegables, variación % opcional, selector $ | US$ en el gráfico y enlaces al listado", () => {
    const view = buildPnlReport({
      from: "2026-10-01",
      to: "2026-11-30",
      categories: CATS,
      paidInstallments: [
        { paidDate: "2026-10-05", amountCents: 200_000_00, currency: "ARS", kind: "income", categoryId: "sueldo" },
        { paidDate: "2026-10-10", amountCents: 100_000_00, currency: "ARS", kind: "expense", categoryId: "alquiler" },
        { paidDate: "2026-11-10", amountCents: 150_000_00, currency: "ARS", kind: "expense", categoryId: "alquiler" },
        { paidDate: "2026-11-12", amountCents: 50_000_00, currency: "ARS", kind: "expense", categoryId: "expensas" },
        { paidDate: "2026-11-12", amountCents: 25_00, currency: "USD", kind: "expense", categoryId: "expensas" },
      ],
    })

    render(
      <PnlReport
        view={view}
        filters={parseMovementQuery({})}
        hasActiveFilters={false}
      />,
    )

    expect(screen.getAllByText("Total ingresos").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Total gastos").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Resultado")).toBeTruthy()
    expect(screen.getByText("Tasa de ahorro")).toBeTruthy()
    expect(screen.getByRole("radiogroup", { name: "Moneda del gráfico" })).toBeTruthy()

    const tabla = screen.getByRole("table")
    expect(within(tabla).queryByText("Alquiler")).toBeNull()

    fireEvent.click(within(tabla).getByRole("button", { name: "Expandir Hogar" }))
    expect(within(tabla).getByText("Alquiler")).toBeTruthy()
    expect(within(tabla).getByText("Expensas")).toBeTruthy()
    expect(within(tabla).getAllByText(/US\$\s*25/).length).toBeGreaterThanOrEqual(1)

    const links = within(tabla).getAllByRole("link")
    const alquilerOct = links.find((l) =>
      l.getAttribute("href")?.includes("categoryId=alquiler") &&
      l.getAttribute("href")?.includes("from=2026-10-01") &&
      l.getAttribute("href")?.includes("to=2026-10-31"),
    )
    expect(alquilerOct?.getAttribute("href")).toBe(
      "/egresos?categoryId=alquiler&from=2026-10-01&to=2026-10-31&por=pago",
    )

    expect(within(tabla).queryByText("+50%")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Variación %" }))
    expect(within(tabla).getByText("+50%")).toBeTruthy()
  })

  it("en estado vacío con filtros activos ofrece limpiar filtros", () => {
    const view = buildPnlReport({
      from: "2026-10-01",
      to: "2026-11-30",
      categories: CATS,
      paidInstallments: [],
    })

    render(
      <PnlReport
        view={view}
        filters={parseMovementQuery({ search: "inexistente" })}
        hasActiveFilters
      />,
    )

    expect(screen.getByRole("link", { name: "Limpiar filtros" }).getAttribute("href")).toBe(
      "/informes",
    )
  })
})
