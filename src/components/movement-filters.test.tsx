// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { es } from "date-fns/locale"

import { MovementFilters } from "@/components/movement-filters"
import { dateToIso } from "@/lib/dates"
import { parseMovementQuery } from "@/lib/movement-query"
import type { CardOption } from "@/server/card-queries"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: () => {} }),
}))

Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

const HOY = dateToIso(new Date())

function dayInCurrentMonth(day: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), day)
}

function getDayButton(date: Date, container?: HTMLElement): HTMLElement {
  const target = date.toLocaleDateString(es.code)
  const scope = container ? within(container) : screen
  const found = scope.getAllByRole("button").find((b) => b.getAttribute("data-day") === target)
  if (!found) throw new Error(`No se encontró el botón del ${target}`)
  return found
}

function getPeriodoTrigger(): HTMLElement {
  return screen.getByRole("button", { name: /^Período:/ })
}

function getCategoriaTrigger(): HTMLElement {
  return screen.getByRole("button", { name: /^Categoría:/ })
}

const CATEGORIAS = [
  { id: "hogar", userId: "u", name: "Hogar", kind: "expense" as const, archived: false, parentId: null, color: null, icon: null },
  { id: "alquiler", userId: "u", name: "Alquiler", kind: "expense" as const, archived: false, parentId: "hogar", color: null, icon: null },
  { id: "cat-1", userId: "u", name: "Supermercado", kind: "expense" as const, archived: false, parentId: null, color: null, icon: null },
  { id: "cat-2", userId: "u", name: "Ocio", kind: "expense" as const, archived: true, parentId: null, color: null, icon: null },
]

const TARJETAS: CardOption[] = [
  { id: "card-1", name: "Visa Galicia", closingDay: 20, dueDay: 5, color: null, archived: false, statements: [] },
]

function montar(
  raw: Record<string, string | string[]> = {},
  cards: CardOption[] = TARJETAS,
  today = HOY,
) {
  push.mockClear()
  return render(
    <MovementFilters
      basePath="/egresos"
      query={parseMovementQuery(raw, "due")}
      defaultSort="due"
      today={today}
      categories={CATEGORIAS}
      cards={cards}
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

    expect(push).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos?search=kiosco")
  })

  it("desmontar mientras el buscador espera no navega después", () => {
    vi.useFakeTimers()
    const { unmount } = montar()

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })

    unmount()
    vi.advanceTimersByTime(400)

    expect(push).not.toHaveBeenCalled()
  })

  it("un solo click en el calendario no navega; cerrar el popover lo aplica como filtro abierto", () => {
    montar()

    fireEvent.click(getPeriodoTrigger())
    const day = dayInCurrentMonth(10)
    fireEvent.click(getDayButton(day))

    expect(push).not.toHaveBeenCalled()

    fireEvent.click(getPeriodoTrigger())

    const iso = dateToIso(day)
    expect(push).toHaveBeenCalledWith(`/egresos?from=${iso}`)
  })

  it("completar un rango de varios días con dos clicks en la misma apertura navega una sola vez", () => {
    montar()

    fireEvent.click(getPeriodoTrigger())
    const dayFrom = dayInCurrentMonth(5)
    fireEvent.click(getDayButton(dayFrom))
    expect(push).not.toHaveBeenCalled()

    const dayTo = dayInCurrentMonth(20)
    fireEvent.click(getDayButton(dayTo))
    expect(push).not.toHaveBeenCalled()

    fireEvent.click(getPeriodoTrigger())

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith(
      `/egresos?from=${dateToIso(dayFrom)}&to=${dateToIso(dayTo)}`,
    )
  })

  it("abrir y cerrar el popover sin tocar nada no navega", () => {
    montar({ status: "paid", from: "2026-01-05", to: "2026-01-20" })

    fireEvent.click(getPeriodoTrigger())
    fireEvent.click(getPeriodoTrigger())

    expect(push).not.toHaveBeenCalled()
  })

  it("un estado inicial de sólo 'to' sin 'from' no se destruye al clickear un día", () => {
    montar({ to: "2026-03-20" })

    fireEvent.click(getPeriodoTrigger())
    const day = new Date(2026, 2, 10)
    fireEvent.click(getDayButton(day))
    fireEvent.click(getPeriodoTrigger())

    expect(push).toHaveBeenCalledWith(`/egresos?from=${dateToIso(day)}`)
  })

  it("el calendario llega al año que viene, no se topa en diciembre de este año", () => {
    const nextYear = new Date().getFullYear() + 1
    const day = new Date(nextYear, 0, 15)
    montar({ from: dateToIso(day) })

    fireEvent.click(getPeriodoTrigger())

    expect(getDayButton(day)).toBeTruthy()
  })

  it("borrar rango saca sólo las fechas y deja el resto de los filtros", () => {
    montar({ status: "paid", from: "2026-01-05", to: "2026-01-20" })

    fireEvent.click(getPeriodoTrigger())
    fireEvent.click(screen.getByRole("button", { name: "Borrar rango" }))

    expect(push).toHaveBeenCalledWith("/egresos?status=paid")
  })

  it("cerrar el popover justo después de 'Borrar rango' no dispara un segundo push", () => {
    montar({ status: "paid", from: "2026-01-05", to: "2026-01-20" })

    fireEvent.click(getPeriodoTrigger())
    fireEvent.click(screen.getByRole("button", { name: "Borrar rango" }))
    expect(push).toHaveBeenCalledTimes(1)

    fireEvent.click(getPeriodoTrigger())

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenLastCalledWith("/egresos?status=paid")
  })

  it("volver atrás con el navegador mientras el período está abierto no se deshace solo al cerrar", () => {
    push.mockClear()
    const queryA = parseMovementQuery({ from: "2026-01-05", to: "2026-01-20" }, "due")
    const { rerender } = render(
      <MovementFilters
        basePath="/egresos"
        query={queryA}
        defaultSort="due"
        today={HOY}
        categories={CATEGORIAS}
        cards={TARJETAS}
      />,
    )

    fireEvent.click(getPeriodoTrigger())

    const queryB = parseMovementQuery({}, "due")
    rerender(
      <MovementFilters
        basePath="/egresos"
        query={queryB}
        defaultSort="due"
        today={HOY}
        categories={CATEGORIAS}
        cards={TARJETAS}
      />,
    )

    fireEvent.click(getPeriodoTrigger())

    expect(push).not.toHaveBeenCalled()
  })

  it("los atajos de fecha navegan directo y las flechas ‹ › corren el período", () => {
    montar({}, TARJETAS, "2026-11-26")

    fireEvent.click(getPeriodoTrigger())
    fireEvent.click(screen.getByRole("button", { name: "Este mes" }))

    expect(push).toHaveBeenCalledWith("/egresos?from=2026-11-01&to=2026-11-30")

    cleanup()
    montar({ from: "2026-11-01", to: "2026-11-30" }, TARJETAS, "2026-11-26")

    expect(getPeriodoTrigger().textContent).toContain("Este mes")
    fireEvent.click(screen.getAllByRole("button", { name: "Período anterior" })[0])
    expect(push).toHaveBeenCalledWith("/egresos?from=2026-10-01&to=2026-10-31")
  })

  it("permite seleccionar múltiples categorías y elegir un padre marca sus hijas", () => {
    montar()

    fireEvent.click(getCategoriaTrigger())
    const dialog = screen.getByRole("dialog", { name: "Categoría" })
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Hogar" }))

    expect(push).toHaveBeenCalledWith("/egresos?categoryId=hogar")

    cleanup()
    montar({ categoryId: "hogar" })

    fireEvent.click(getCategoriaTrigger())
    const dialog2 = screen.getByRole("dialog", { name: "Categoría" })
    expect(within(dialog2).getByRole("checkbox", { name: "Hogar" }).getAttribute("data-state")).toBe(
      "checked",
    )
    expect(
      within(dialog2).getByRole("checkbox", { name: "Hogar › Alquiler" }).getAttribute("data-state"),
    ).toBe("checked")
  })

  it("filtra por medio de pago, moneda, importe y orden", () => {
    montar()

    fireEvent.click(screen.getByLabelText("Medio de pago"))
    fireEvent.click(screen.getByText("Visa Galicia"))
    expect(push).toHaveBeenCalledWith("/egresos?cardId=card-1")

    fireEvent.click(screen.getByLabelText("Moneda"))
    fireEvent.click(screen.getByText("USD"))
    expect(push).toHaveBeenLastCalledWith("/egresos?cardId=card-1&currency=USD")

    fireEvent.click(screen.getByRole("button", { name: /^Importe:/ }))
    fireEvent.change(screen.getByLabelText("Mínimo"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Máximo"), { target: { value: "5000" } })
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))
    expect(push).toHaveBeenLastCalledWith(
      "/egresos?cardId=card-1&currency=USD&min=1000&max=5000",
    )

    fireEvent.click(screen.getByLabelText("Orden"))
    fireEvent.click(screen.getByRole("option", { name: "Importe" }))
    expect(push).toHaveBeenLastCalledWith(
      "/egresos?cardId=card-1&currency=USD&min=1000&max=5000&sort=amount",
    )
  })

  it("muestra chips de filtros activos con × y 'Limpiar todo'", () => {
    montar({ search: "alquiler", status: "overdue", cardId: "cash", page: "3" })

    const chips = screen.getByLabelText("Filtros activos")
    expect(chips.textContent).toContain('Buscar: "alquiler"')
    expect(chips.textContent).toContain("Medio: Efectivo / débito")
    expect(chips.textContent).toContain("Estado: Vencidos")

    fireEvent.click(within(chips).getByRole("button", { name: 'Quitar filtro Estado: Vencidos' }))
    expect(push).toHaveBeenCalledWith("/egresos?search=alquiler&cardId=cash")

    fireEvent.click(within(chips).getByRole("button", { name: "Limpiar todo" }))
    expect(push).toHaveBeenLastCalledWith("/egresos")
    expect(screen.getByLabelText<HTMLInputElement>("Buscar").value).toBe("")
  })

  it("sin filtros puestos no muestra chips ni 'Limpiar todo'", () => {
    montar()
    expect(screen.queryByLabelText("Filtros activos")).toBeNull()
  })

  it("cambiar otro filtro mientras el buscador espera cancela ese debounce", () => {
    vi.useFakeTimers()
    montar({ status: "paid" })

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })
    fireEvent.click(screen.getByLabelText("Moneda"))
    fireEvent.click(screen.getByText("USD"))

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos?currency=USD&status=paid")

    vi.advanceTimersByTime(400)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it("limpiar todo no deja un debounce viejo que resucite el filtro borrado", () => {
    vi.useFakeTimers()
    montar({ search: "alquiler", status: "overdue", page: "3" })

    fireEvent.click(screen.getByRole("button", { name: "Limpiar todo" }))
    vi.advanceTimersByTime(400)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos")
  })

  it("los ids de la barra de filtros están prefijados para no chocar con el formulario de carga", () => {
    montar()

    expect(screen.getByLabelText("Buscar").id).toBe("filtro-buscar")
    expect(getCategoriaTrigger().id).toBe("filtro-categoria")
    expect(screen.getByLabelText("Medio de pago").id).toBe("filtro-tarjeta")
    expect(screen.getByLabelText("Moneda").id).toBe("filtro-moneda")
    expect(screen.getByRole("button", { name: /^Importe:/ }).id).toBe("filtro-importe")
    expect(getPeriodoTrigger().id).toBe("filtro-periodo")
    expect(screen.getByLabelText("Orden").id).toBe("filtro-orden")
  })

  it("en móvil el contador incluye el estado y la hoja inferior espera al botón Aplicar", () => {
    montar({ status: "overdue", categoryId: "hogar" })

    fireEvent.click(screen.getByRole("button", { name: "Filtros (2)" }))

    const panel = screen.getByRole("dialog", { name: "Filtros" })
    fireEvent.click(within(panel).getByRole("button", { name: "Pendientes" }))
    fireEvent.change(within(panel).getByLabelText("Importe mínimo"), { target: { value: "2500" } })

    // Todavía no navegó hasta apretar Aplicar.
    expect(push).not.toHaveBeenCalled()

    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos?categoryId=hogar&status=pending&min=2500")
  })

  it("permite ocultar controles para /informes y conserva extraParams y el chip Pagado cuando por=pago", () => {
    push.mockClear()
    render(
      <MovementFilters
        basePath="/informes"
        query={parseMovementQuery({ from: "2026-10-01", to: "2026-10-31", por: "pago" })}
        today="2026-11-26"
        categories={CATEGORIAS}
        cards={TARJETAS}
        showSearch={false}
        showCategory={false}
        showPaymentMethod={false}
        showCurrency={false}
        showAmount={false}
        showSort={false}
        showStatus={false}
        extraParams={{ tab: "flujo", moneda: "USD" }}
      />,
    )

    expect(screen.queryByLabelText("Buscar")).toBeNull()
    expect(screen.queryByRole("button", { name: /^Categoría:/ })).toBeNull()
    expect(screen.queryByLabelText("Orden")).toBeNull()

    const chips = screen.getByLabelText("Filtros activos")
    expect(chips.textContent).toContain("Pagado:")

    fireEvent.click(screen.getAllByRole("button", { name: "Período anterior" })[0])
    expect(push).toHaveBeenCalledWith(
      "/informes?tab=flujo&moneda=USD&from=2026-09-01&to=2026-09-30&por=pago",
    )
  })
})
