// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

import { AppSidebar } from "@/components/app-sidebar"

vi.mock("@/auth-client", () => ({ signOut: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(cleanup)

describe("AppSidebar", () => {
  it("muestra la marca antes de Dashboard en el riel y el encabezado móvil", () => {
    const { container } = render(<AppSidebar />)
    const rail = container.querySelector("aside")!
    const railLogo = within(rail).getByRole("img", { name: "Mis Pesitos" })
    const dashboard = within(rail).getByRole("link", { name: "Dashboard" })

    expect(railLogo.getAttribute("src")).toBe("/brand/mark.svg")
    expect(railLogo.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(screen.getAllByRole("img", { name: "Mis Pesitos" })).toHaveLength(2)
  })
})
