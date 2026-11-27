// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

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

const loadQuickAddData = vi.fn()
vi.mock("@/server/actions/quick-add", () => ({
  loadQuickAddData: () => loadQuickAddData(),
}))

global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

const data = {
  expenseCategories,
  incomeCategories,
  cards: [],
  expenseSuggestions: [],
  incomeSuggestions: [],
  today: "2026-11-26",
}

afterEach(() => {
  cleanup()
  mockPathname = "/dashboard"
  loadQuickAddData.mockReset()
})

describe("QuickAddSheet", () => {
  it("se abre con el evento global en modo Egreso y permite alternar a Ingreso", () => {
    loadQuickAddData.mockResolvedValue(data)
    render(<QuickAddSheet />)

    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent(window, new CustomEvent("mis-pesitos:quick-add"))
    expect(screen.getByRole("heading", { name: "Nuevo egreso" })).toBeTruthy()

    fireEvent.click(screen.getByRole("radio", { name: "Ingreso" }))
    expect(screen.getByRole("heading", { name: "Nuevo ingreso" })).toBeTruthy()
  })

  it("arranca en modo Ingreso cuando se dispara desde /ingresos", () => {
    loadQuickAddData.mockResolvedValue(data)
    mockPathname = "/ingresos"
    render(<QuickAddSheet />)

    act(() => {
      openQuickAddSheet()
    })
    expect(screen.getByRole("heading", { name: "Nuevo ingreso" })).toBeTruthy()
  })

  it("no pide los catálogos hasta abrirse, y los vuelve a pedir en cada apertura", async () => {
    loadQuickAddData.mockResolvedValue(data)
    render(<QuickAddSheet />)
    expect(loadQuickAddData).not.toHaveBeenCalled()

    act(() => {
      openQuickAddSheet()
    })
    expect(screen.getByLabelText("Cargando formulario")).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText(/Descripción/i)).toBeTruthy())
    expect(loadQuickAddData).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    act(() => {
      openQuickAddSheet()
    })
    // La segunda vez muestra lo que ya tenía mientras refresca.
    expect(screen.queryByLabelText("Cargando formulario")).toBeNull()
    await waitFor(() => expect(loadQuickAddData).toHaveBeenCalledTimes(2))
  })

  it("si la carga falla ofrece reintentar", async () => {
    loadQuickAddData.mockRejectedValueOnce(new Error("red")).mockResolvedValue(data)
    render(<QuickAddSheet />)

    act(() => {
      openQuickAddSheet()
    })
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }))
    await waitFor(() => expect(screen.getByLabelText(/Descripción/i)).toBeTruthy())
  })
})
