// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { AppHeader, PageTitle } from "@/components/app-header"

let mockPathname = "/dashboard"
const back = vi.fn()
const forward = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ back, forward }),
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  mockPathname = "/dashboard"
  vi.clearAllMocks()
})

function crumbs() {
  return screen.getByRole("navigation", { name: "Ubicación" })
}

describe("AppHeader", () => {
  it("muestra la página actual", () => {
    render(<AppHeader />)
    const current = within(crumbs()).getByText("Dashboard")
    expect(current.getAttribute("aria-current")).toBe("page")
  })

  it("muestra la jerarquía con enlace a la sección padre", () => {
    mockPathname = "/ajustes/usuarios"
    render(<AppHeader />)
    expect(within(crumbs()).getByRole("link", { name: "Ajustes" }).getAttribute("href")).toBe(
      "/ajustes",
    )
    expect(within(crumbs()).getByText("Usuarios").getAttribute("aria-current")).toBe("page")
  })

  it("usa el título que define la página para rutas dinámicas", () => {
    mockPathname = "/tarjetas/abc-123"
    render(
      <>
        <AppHeader />
        <PageTitle title="Visa Galicia" />
      </>,
    )
    expect(within(crumbs()).getByRole("link", { name: "Tarjetas" })).toBeTruthy()
    expect(within(crumbs()).getByText("Visa Galicia")).toBeTruthy()
    expect(within(crumbs()).queryByText("Detalle")).toBeNull()
  })

  it("navega atrás y adelante y alterna la barra lateral", () => {
    render(<AppHeader />)
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }))
    fireEvent.click(screen.getByRole("button", { name: "Adelante" }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(forward).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Expandir barra lateral" }))
    expect(window.localStorage.getItem("mispesitos:sidebar-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: "Contraer barra lateral" })).toBeTruthy()
  })
})
