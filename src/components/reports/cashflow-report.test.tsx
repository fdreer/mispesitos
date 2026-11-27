// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { CashflowReport } from "@/components/reports/cashflow-report"
import { buildCashflowReport } from "@/lib/reports-cashflow"

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

describe("CashflowReport", () => {
  it("muestra aviso de saldo proyectado negativo, panel lateral con saldos, cotización y atrasado", () => {
    const view = buildCashflowReport({
      today: "2026-11-15",
      from: "2026-11-15",
      to: "2026-12-31",
      granularity: "mensual",
      balances: { arsCents: 100_000_00, usdCents: 50_00 },
      officialRate: {
        compra: 1000,
        venta: 1100,
        fetchedAt: new Date("2026-11-15T17:30:00Z"),
        stale: false,
      },
      pending: [
        { id: "p-atrasado", dueDate: "2026-11-01", amountCents: 40_000_00, currency: "ARS", kind: "expense" },
        { id: "p-dic", dueDate: "2026-12-10", amountCents: 200_000_00, currency: "ARS", kind: "expense" },
      ],
    })

    render(<CashflowReport view={view} />)

    const alerta = screen.getByRole("alert")
    expect(alerta.textContent).toContain("En diciembre te faltarían")
    expect(alerta.textContent).toContain("90.000")

    expect(screen.getByText("Atrasado")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Ver egresos vencidos" }).getAttribute("href")).toBe(
      "/egresos?status=overdue",
    )
    expect(screen.getByText("Saldos de hoy")).toBeTruthy()
    expect(screen.getByText(/Compra/)).toBeTruthy()
  })
})
