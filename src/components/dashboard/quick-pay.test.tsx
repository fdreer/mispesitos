// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { groupByDue, QuickPay } from "@/components/dashboard/quick-pay"
import type { UpcomingItem, UpcomingStatement } from "@/lib/dashboard-view"

const setInstallmentPaid = vi.fn()
vi.mock("@/server/actions/movements", () => ({
  setInstallmentPaid: (...args: unknown[]) => setInstallmentPaid(...args),
}))
vi.mock("@/server/actions/cards", () => ({
  payStatement: vi.fn(),
  unpayStatement: vi.fn(),
  updateStatementDates: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
  setInstallmentPaid.mockReset()
})

const TODAY = "2026-11-27"

const cuota = (id: string, dueDate: string, kind: "income" | "expense" = "expense"): UpcomingItem => ({
  id,
  number: 2,
  dueDate,
  amountCents: 10_000_00,
  description: id,
  currency: "ARS",
  kind,
  status: dueDate < TODAY ? "overdue" : "pending",
})

const resumen = (closingDate: string | null): UpcomingStatement => ({
  type: "statement",
  id: "res-1",
  cardId: "visa",
  cardName: "Visa",
  period: "2026-11",
  dueDate: "2026-12-05",
  closingDate,
  arsCents: 480_000_00,
  usdCents: 0,
  count: 3,
  kind: "expense",
  status: "pending",
})

const CONTEXT = { officialSellRate: 1575, suggestedBuyRate: null, usdBalanceCents: 0 }

describe("groupByDue", () => {
  it("agrupa vencidos primero, después este mes y los meses siguientes", () => {
    const groups = groupByDue(
      [cuota("dic", "2026-12-10"), cuota("nov", "2026-11-30"), cuota("vieja", "2026-11-01")],
      TODAY,
    )
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Vencidos", ["vieja"]],
      ["Este mes", ["nov"]],
      ["Diciembre", ["dic"]],
    ])
  })
})

describe("QuickPay", () => {
  it("marca una cuota pagada hoy con un toque", async () => {
    setInstallmentPaid.mockResolvedValue({ ok: true })
    render(
      <QuickPay
        payments={[cuota("Luz", "2026-11-30")]}
        receivables={[]}
        today={TODAY}
        statementContext={CONTEXT}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Marcar pagada hoy: Luz, cuota 2" }))

    await waitFor(() => expect(setInstallmentPaid).toHaveBeenCalledWith("Luz", true, undefined))
  })

  it("si falla, la cuota vuelve a quedar sin tildar y muestra el error", async () => {
    setInstallmentPaid.mockResolvedValue({ ok: false, message: "No pudimos actualizar la cuota." })
    render(
      <QuickPay
        payments={[cuota("Luz", "2026-11-30")]}
        receivables={[]}
        today={TODAY}
        statementContext={CONTEXT}
      />,
    )

    const button = screen.getByRole("button", { name: "Marcar pagada hoy: Luz, cuota 2" })
    fireEvent.click(button)

    expect(await screen.findByText("No pudimos actualizar la cuota.")).toBeTruthy()
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it("un resumen cerrado se paga desde acá; uno abierto sólo lleva al detalle", () => {
    render(
      <QuickPay
        payments={[resumen("2026-11-20")]}
        receivables={[]}
        today={TODAY}
        statementContext={CONTEXT}
      />,
    )
    expect(screen.getByRole("button", { name: "Pagar" })).toBeTruthy()

    cleanup()
    render(
      <QuickPay
        payments={[resumen("2026-11-30")]}
        receivables={[]}
        today={TODAY}
        statementContext={CONTEXT}
      />,
    )
    expect(screen.queryByRole("button", { name: "Pagar" })).toBeNull()
    expect(screen.getByText(/cierra 30\/11/)).toBeTruthy()
  })

  it("separa lo que hay que pagar de lo que hay que cobrar", () => {
    render(
      <QuickPay
        payments={[cuota("Luz", "2026-11-30")]}
        receivables={[cuota("Honorarios", "2026-12-02", "income")]}
        today={TODAY}
        statementContext={CONTEXT}
      />,
    )
    expect(screen.queryByText("Honorarios")).toBeNull()

    fireEvent.click(screen.getByRole("radio", { name: "A cobrar · 1" }))
    const list = screen.getByRole("region", { name: "Diciembre" })
    expect(within(list).getByText("Honorarios")).toBeTruthy()
    expect(screen.queryByText("Luz")).toBeNull()
  })
})
