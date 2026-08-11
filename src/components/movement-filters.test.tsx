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

  // El timeout del debounce es un setTimeout de JS puro, ajeno al ciclo de
  // vida de React: si el componente se desmonta antes de que se cumplan los
  // 400ms, nada lo cancela y dispara igual, navegando desde una pantalla que
  // ya no existe.
  it("desmontar mientras el buscador espera no navega después", () => {
    vi.useFakeTimers()
    const { unmount } = montar()

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })

    unmount()
    vi.advanceTimersByTime(400)

    expect(push).not.toHaveBeenCalled()
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

  // Finding 1: "Limpiar" navegaba a basePath pero dejaba el estado local del
  // buscador (`search`) intacto, así que el input seguía mostrando el texto
  // tipeado aunque la URL ya no tuviera `search`. El test anterior
  // ("limpiar borra todos los filtros de una") sólo miraba el argumento de
  // `push` y por eso no lo detectaba.
  it("limpiar también vacía el buscador, no sólo la URL", () => {
    montar({ search: "alquiler", status: "overdue", page: "3" })

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }))

    expect(screen.getByLabelText<HTMLInputElement>("Buscar").value).toBe("")
  })

  // Finding 2: el timeout del debounce cierra sobre el `query` vigente al
  // tipear. Si mientras espera la persona cambia otro filtro, `go()` navega
  // ya mismo, pero el timeout seguía armado y disparaba después con el
  // `query` viejo (sin el filtro recién elegido), pisándolo.
  it("cambiar otro filtro mientras el buscador espera cancela ese debounce", () => {
    vi.useFakeTimers()
    montar({ status: "paid" })

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } })

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos?status=paid&from=2026-01-01")

    vi.advanceTimersByTime(400)

    // Si el debounce no se hubiera cancelado, acá dispararía con el `query`
    // de antes del cambio de fecha (sin `from`) y lo pisaría.
    expect(push).toHaveBeenCalledTimes(1)
  })

  // Finding 3: "Limpiar" vacía `search`, y ese cambio de estado local
  // re-armaba el efecto de debounce (guardia `search === query.search`,
  // ahora falsa) con el `query` de ANTES del click cerrado en el closure. 400ms
  // después disparaba solo y resucitaba el filtro que "Limpiar" acababa de
  // borrar. Ningún test anterior lo agarraba porque ninguno avanzaba el reloj
  // después de clickear Limpiar.
  it("limpiar no deja un debounce viejo que resucite el filtro borrado", () => {
    vi.useFakeTimers()
    montar({ search: "alquiler", status: "overdue", page: "3" })

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }))
    vi.advanceTimersByTime(400)

    // Sin la cancelación, acá habría un segundo push a "/egresos?status=overdue".
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos")
  })

  // Minor: nada ejercía el onValueChange de los Select ni la asociación
  // htmlFor/id de sus Label. getByLabelText sólo encuentra el trigger si esa
  // asociación está bien hecha.
  it("elegir una categoría navega con ese filtro", () => {
    montar()

    fireEvent.click(screen.getByLabelText("Categoría"))
    fireEvent.click(screen.getByText("Supermercado"))

    expect(push).toHaveBeenCalledWith("/egresos?categoryId=cat-1")
  })

  it("elegir un estado navega con ese filtro", () => {
    montar()

    fireEvent.click(screen.getByLabelText("Estado"))
    fireEvent.click(screen.getByText("Pagado"))

    expect(push).toHaveBeenCalledWith("/egresos?status=paid")
  })
})
