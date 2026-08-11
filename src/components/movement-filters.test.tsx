// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { MovementFilters } from "@/components/movement-filters"
import { parseMovementQuery } from "@/lib/movement-query"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: () => {} }),
}))

// Radix (el Select de shadcn) usa dos APIs de puntero que jsdom no implementa.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

const CATEGORIAS = [
  { id: "cat-1", userId: "u", name: "Supermercado", kind: "expense" as const, archived: false },
  { id: "cat-2", userId: "u", name: "Ocio", kind: "expense" as const, archived: true },
]

function montar(raw: Record<string, string> = {}) {
  push.mockClear()
  return render(
    <MovementFilters
      basePath="/egresos"
      query={parseMovementQuery(raw)}
      categories={CATEGORIAS}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("MovementFilters", () => {
  it("el buscador espera a que se termine de tipear antes de navegar", () => {
    vi.useFakeTimers()
    montar()

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kio" } })
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })

    // Dos teclas, ninguna navegación todavía: sin la espera serían dos.
    expect(push).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos?search=kiosco")
  })

  it("elegir una fecha navega con el filtro puesto", () => {
    montar()

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } })

    expect(push).toHaveBeenCalledWith("/egresos?from=2026-01-01")
  })

  it("cambiar un filtro con página vieja vuelve a la página 1", () => {
    montar({ page: "7", status: "paid" })

    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-12-31" } })

    expect(push).toHaveBeenCalledWith("/egresos?status=paid&to=2026-12-31")
  })

  it("muestra el valor que viene de la URL, no uno vacío", () => {
    montar({ search: "alquiler", from: "2026-03-01" })

    expect(screen.getByLabelText<HTMLInputElement>("Buscar").value).toBe("alquiler")
    expect(screen.getByLabelText<HTMLInputElement>("Desde").value).toBe("2026-03-01")
  })

  it("limpiar borra todos los filtros de una", () => {
    montar({ search: "alquiler", status: "overdue", page: "3" })

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }))

    expect(push).toHaveBeenCalledWith("/egresos")
  })

  it("sin filtros puestos no ofrece limpiar", () => {
    montar()

    expect(screen.queryByRole("button", { name: "Limpiar" })).toBeNull()
  })
})
