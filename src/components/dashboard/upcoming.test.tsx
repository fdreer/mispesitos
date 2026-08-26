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
})
