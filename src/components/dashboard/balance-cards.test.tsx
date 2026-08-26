// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { BalanceCards } from "@/components/dashboard/balance-cards"

afterEach(cleanup)

describe("BalanceCards", () => {
  it("compacta cinco cards y prioriza los pagos del mes actual y del siguiente", () => {
    const { container } = render(
      <BalanceCards
        arsCents={12_345_678_00}
        usdCents={8_765_432_00}
        consolidatedArsCents={20_000_000_00}
        rate={1535.75}
        paymentsThisMonth={{ arsCents: 7_000_000_00, count: 3, overdueCount: 1 }}
        paymentsNextMonth={{ arsCents: 2_500_000_00, count: 2 }}
      />,
    )

    const cards = Array.from(container.querySelectorAll('[data-slot="card"]'))
    expect(cards).toHaveLength(5)
    expect(cards.every((card) => card.className.includes("gap-2") && card.className.includes("py-3"))).toBe(true)
    expect(container.firstElementChild?.className).toContain("lg:max-w-5xl")
    expect(container.firstElementChild?.className).toContain("lg:grid-cols-5")

    expect(screen.getByText("Saldo en pesos")).toBeTruthy()
    expect(screen.getByText(/12\.345\.678/)).toBeTruthy()
    expect(screen.getByText(/8\.765\.432/)).toBeTruthy()
    expect(screen.getByText(/20\.000\.000/)).toBeTruthy()
    expect(screen.getByText("Impagos este mes")).toBeTruthy()
    expect(screen.getByText("A pagar el mes próximo")).toBeTruthy()
    expect(screen.getByText(/7\.000\.000/)).toBeTruthy()
    expect(screen.getByText(/2\.500\.000/)).toBeTruthy()
    expect(screen.getByText("3 conceptos · 1 vencido")).toBeTruthy()
    expect(screen.getByText("2 conceptos")).toBeTruthy()
    expect(screen.getByText(/dólar a 1\.536/)).toBeTruthy()
    expect(container.querySelectorAll("p.text-xl")).toHaveLength(5)
    expect(Array.from(container.querySelectorAll("p.text-xl")).every((amount) => amount.className.includes("whitespace-nowrap"))).toBe(true)
    expect(container.textContent).not.toMatch(/,\d{2}/)
    expect(screen.queryByText("Resultado del mes")).toBeNull()
  })
})
