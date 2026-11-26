// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { QuickAddSheet } from "@/components/quick-add-sheet"
import { openQuickAddSheet } from "@/lib/mobile-nav"
import type { Category } from "@/server/queries"

let mockPathname = "/dashboard"

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/server/actions/movements", () => ({
  createMovement: vi.fn().mockResolvedValue({ ok: true }),
  updateMovement: vi.fn().mockResolvedValue({ ok: true }),
}))

const expenseCategories: Category[] = [
  {
    id: "cat-exp-1",
    userId: "u1",
    name: "Supermercado",
    kind: "expense",
    parentId: null,
    color: null,
    icon: null,
    archived: false,
  },
]

const incomeCategories: Category[] = [
  {
    id: "cat-inc-1",
    userId: "u1",
    name: "Sueldo",
    kind: "income",
    parentId: null,
    color: null,
    icon: null,
    archived: false,
  },
]

afterEach(() => {
  cleanup()
  mockPathname = "/dashboard"
})

describe("QuickAddSheet", () => {
  it("se abre con el evento global en modo Egreso y permite alternar a Ingreso", () => {
    render(
      <QuickAddSheet
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        cards={[]}
        expenseSuggestions={[]}
        incomeSuggestions={[]}
        suggestedRate={1200}
        today="2026-11-26"
      />,
    )

    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent(window, new CustomEvent("mis-pesitos:quick-add"))
    expect(screen.getByRole("heading", { name: "Nuevo egreso" })).toBeTruthy()

    fireEvent.click(screen.getByRole("radio", { name: "Ingreso" }))
    expect(screen.getByRole("heading", { name: "Nuevo ingreso" })).toBeTruthy()
  })

  it("arranca en modo Ingreso cuando se dispara desde /ingresos", () => {
    mockPathname = "/ingresos"
    render(
      <QuickAddSheet
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        cards={[]}
        expenseSuggestions={[]}
        incomeSuggestions={[]}
        suggestedRate={1200}
        today="2026-11-26"
      />,
    )

    act(() => {
      openQuickAddSheet()
    })
    expect(screen.getByRole("heading", { name: "Nuevo ingreso" })).toBeTruthy()
  })
})
