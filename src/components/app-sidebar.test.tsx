// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { AppSidebar } from "@/components/app-sidebar"

let mockPathname = "/dashboard"

vi.mock("@/auth-client", () => ({ signOut: vi.fn().mockResolvedValue({}) }))

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  mockPathname = "/dashboard"
})

describe("AppSidebar", () => {
  it("muestra la marca antes de Dashboard en el riel de escritorio", () => {
    const { container } = render(<AppSidebar />)
    const rail = container.querySelector("aside")!
    const railLogo = within(rail).getByRole("img", { name: "Mis Pesitos" })
    const dashboard = within(rail).getByRole("link", { name: "Dashboard" })

    expect(railLogo.getAttribute("src")).toBe("/brand/mark.svg")
    expect(railLogo.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it("permite expandir y contraer la barra lateral en escritorio y persiste el estado", () => {
    const { container } = render(<AppSidebar />)
    const rail = container.querySelector("aside")!

    expect(rail.getAttribute("data-expanded")).toBe("false")
    expect(rail.className).toContain("w-[68px]")

    const expandBtn = within(rail).getByRole("button", { name: "Expandir barra lateral" })
    expect(expandBtn.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(expandBtn)

    expect(rail.getAttribute("data-expanded")).toBe("true")
    expect(rail.className).toContain("w-60")
    expect(window.localStorage.getItem("mispesitos:sidebar-expanded")).toBe("true")
    expect(within(rail).getByText("Principal")).toBeTruthy()
    expect(within(rail).getByText("Finanzas")).toBeTruthy()
    expect(within(rail).getByText("Configuración")).toBeTruthy()

    const collapseBtn = within(rail).getByRole("button", { name: "Contraer barra lateral" })
    expect(collapseBtn.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(collapseBtn)

    expect(rail.getAttribute("data-expanded")).toBe("false")
    expect(rail.className).toContain("w-[68px]")
    expect(window.localStorage.getItem("mispesitos:sidebar-expanded")).toBe("false")
  })

  it("renderiza la barra inferior móvil con Inicio, Egresos, +, Ingresos y Más", () => {
    const onQuickAdd = vi.fn()
    render(<AppSidebar onQuickAdd={onQuickAdd} />)

    const mobileNav = screen.getByRole("navigation", { name: "Navegación móvil" })
    expect(within(mobileNav).getByRole("link", { name: "Inicio" }).getAttribute("href")).toBe(
      "/dashboard",
    )
    expect(within(mobileNav).getByRole("link", { name: "Egresos" }).getAttribute("href")).toBe(
      "/egresos",
    )
    expect(within(mobileNav).getByRole("link", { name: "Ingresos" }).getAttribute("href")).toBe(
      "/ingresos",
    )
    expect(within(mobileNav).getByRole("button", { name: "Más" })).toBeTruthy()

    const addBtn = within(mobileNav).getByRole("button", { name: "Cargar movimiento" })
    fireEvent.click(addBtn)
    expect(onQuickAdd).toHaveBeenCalledTimes(1)
  })

  it("abre el menú Más con las rutas restantes y el botón Salir", () => {
    mockPathname = "/tarjetas/card-1"
    render(<AppSidebar />)

    const mobileNav = screen.getByRole("navigation", { name: "Navegación móvil" })
    fireEvent.click(within(mobileNav).getByRole("button", { name: "Más" }))

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("link", { name: "Tarjetas" }).getAttribute("aria-current")).toBe(
      "page",
    )
    expect(within(dialog).getByRole("link", { name: "Informes" }).getAttribute("href")).toBe(
      "/informes",
    )
    expect(within(dialog).getByRole("link", { name: "Cambios" }).getAttribute("href")).toBe(
      "/cambios",
    )
    expect(within(dialog).getByRole("link", { name: "Categorías" }).getAttribute("href")).toBe(
      "/categorias",
    )
    expect(within(dialog).getByRole("link", { name: "Ajustes" }).getAttribute("href")).toBe(
      "/ajustes",
    )
    expect(within(dialog).getByRole("button", { name: "Salir" })).toBeTruthy()
  })
})
