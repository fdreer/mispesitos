// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { CategoryPie } from "@/components/dashboard/charts"

global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(cleanup)

const DATOS = {
  ars: [
    {
      id: "h",
      name: "Hogar",
      hue: 250,
      arsCents: 75_000_00,
      children: [
        { id: "a", name: "Alquiler", hue: 250, arsCents: 50_000_00 },
        { id: "e", name: "Expensas", hue: 250, arsCents: 25_000_00 },
      ],
    },
    { id: "o", name: "Ocio", hue: 300, arsCents: 25_000_00, children: [] },
  ],
  usd: [
    { id: "s", name: "Suscripciones", hue: 200, arsCents: 30_00, children: [] },
  ],
}

describe("CategoryPie", () => {
  it("sin gastos lo dice, en vez de una torta vacía", () => {
    render(<CategoryPie data={{ ars: [], usd: [] }} />)
    expect(screen.getByText("Todavía no pagaste nada este mes.")).toBeTruthy()
  })

  it("lista cada categoría padre con su importe y permite cambiar a US$", () => {
    render(<CategoryPie data={DATOS} />)
    const lista = screen.getByRole("list", { name: "Gastos por categoría" })
    expect(lista.textContent).toContain("Hogar")
    expect(lista.textContent).toContain("75%")
    expect(lista.textContent).toContain("Ocio")
    expect(lista.textContent).toContain("25%")

    fireEvent.click(screen.getByRole("radio", { name: "US$" }))
    expect(screen.getByRole("list", { name: "Gastos por categoría" }).textContent).toContain(
      "Suscripciones",
    )
  })

  it("el desglose por subcategoría se despliega desde el padre", () => {
    render(<CategoryPie data={DATOS} />)
    expect(screen.queryByText("Alquiler")).toBeNull()

    const hogar = screen.getByRole("button", { name: /Hogar/ })
    expect(hogar.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(hogar)

    const desglose = document.getElementById(hogar.getAttribute("aria-controls")!)!
    expect(within(desglose).getByText("Alquiler")).toBeTruthy()
    expect(within(desglose).getByText("Expensas")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Ocio/ })).toBeNull()
  })
})
