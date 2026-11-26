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
  it("muestra aviso de saldo proyectado negativo, bloque de Atrasado aparte y estilos por tipo de período", () => {
    const view = buildCashflowReport({
      today: "2026-11-15",
      from: "2026-10-01",
      to: "2026-12-31",
      granularity: "mensual",
      currencyMode: "ARS",
      settings: {
        initialBalanceArsCents: 100_000_00,
        initialBalanceUsdCents: 0,
        initialBalanceUsdRate: "0",
        initialBalanceDate: "2026-09-01",
      },
      paid: [],
      exchanges: [],
      pending: [
        { id: "p-atrasado", dueDate: "2026-11-01", amountCents: 40_000_00, currency: "ARS", rate: "1", kind: "expense" },
        { id: "p-dic", dueDate: "2026-12-10", amountCents: 120_000_00, currency: "ARS", rate: "1", kind: "expense" },
      ],
    })

    render(<CashflowReport view={view} />)

    const alerta = screen.getByRole("alert")
    expect(alerta.textContent).toContain("En diciembre te faltarían")
    expect(alerta.textContent).toContain("60.000")

    expect(screen.getByText(/Atrasado:/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Ver egresos vencidos" }).getAttribute("href")).toBe(
      "/egresos?status=overdue",
    )

    expect(screen.getByText("Real")).toBeTruthy()
    expect(screen.getByText("En curso")).toBeTruthy()
    expect(screen.getByText("Proyectado")).toBeTruthy()
  })
})
