// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { Upcoming } from "@/components/dashboard/upcoming"
import type { UpcomingItem } from "@/lib/dashboard-view"

vi.mock("@/server/actions/movements", () => ({ setInstallmentPaid: vi.fn() }))

afterEach(cleanup)

const payment: UpcomingItem = {
  id: "expense-1",
  number: 1,
  dueDate: "2026-08-01",
  amountCents: 20_000,
  description: "Pago de luz",
  currency: "ARS",
  kind: "expense",
  status: "overdue",
}

const receivable: UpcomingItem = {
  id: "income-1",
  number: 1,
  dueDate: "2026-08-20",
  amountCents: 50_000,
  description: "Honorarios",
  currency: "ARS",
  kind: "income",
  status: "pending",
}

describe("Upcoming", () => {
  it("muestra pagos y cobros en cards separadas", () => {
    render(<Upcoming payments={[payment]} receivables={[receivable]} today="2026-08-10" />)

    const paymentsCard = screen.getByText("Pagos pendientes").closest('[data-slot="card"]')
    const receivablesCard = screen.getByText("Cobros pendientes").closest('[data-slot="card"]')

    expect(paymentsCard?.textContent).toContain("Pago de luz")
    expect(paymentsCard?.textContent).not.toContain("Honorarios")
    expect(receivablesCard?.textContent).toContain("Honorarios")
    expect(receivablesCard?.textContent).not.toContain("Pago de luz")
  })

  it("un resumen de tarjeta es un renglón que lleva a /tarjetas, sin botón de pago", () => {
    render(
      <Upcoming
        payments={[
          {
            type: "statement",
            id: "res-1",
            cardId: "visa",
            cardName: "Visa",
            period: "2026-11",
            dueDate: "2026-12-05",
            arsCents: 480_000_00,
            usdCents: 0,
            kind: "expense",
            status: "pending",
          },
        ]}
        receivables={[]}
        today="2026-11-26"
      />,
    )

    expect(screen.getByText(/Visa · resumen nov 2026/)).toBeTruthy()
    const link = screen.getByRole("link", { name: /Ver resumen/ })
    expect(link.getAttribute("href")).toBe("/tarjetas/visa?periodo=2026-11")
    expect(screen.queryByRole("button", { name: /pag/i })).toBeNull()
  })
})
