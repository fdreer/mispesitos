// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { KeyFigures } from "@/components/dashboard/balance-cards"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

const BASE = {
  today: "2026-11-27",
  arsCents: 12_345_678_00,
  usdCents: 8_765_00,
  consolidatedArsCents: 20_000_000_00,
  officialRate: {
    compra: 1535.75,
    venta: 1575.0,
    fetchedAt: new Date("2026-11-27T17:30:00Z"),
    stale: false,
  },
  committed: {
    totalCents: 3_000_000_00,
    overdueCents: 40_000_00,
    incomingCents: 5_000_000_00,
    unconvertedUsdCents: 0,
    untilLabel: "abr 2027",
  },
  paymentsThisMonth: { arsCents: 7_000_000_00, usdCents: 50_00, count: 3, overdueCount: 1 },
}

describe("KeyFigures", () => {
  it("muestra disponible, comprometido, próxima tarjeta y lo de este mes, en ese orden", () => {
    const { container } = render(
      <KeyFigures
        {...BASE}
        nextCardDue={{
          type: "statement",
          id: "res-1",
          cardId: "visa",
          cardName: "Visa",
          period: "2026-11",
          dueDate: "2026-11-29",
          closingDate: "2026-11-20",
          arsCents: 480_000_00,
          usdCents: 20_00,
          count: 4,
          kind: "expense",
          status: "pending",
          usdInArsCents: 31_500_00,
          laterCount: 1,
        }}
      />,
    )

    const titles = Array.from(container.querySelectorAll('[data-slot="card-title"]')).map(
      (t) => t.textContent,
    )
    expect(titles).toEqual([
      "Disponible hoy",
      "Comprometido hasta abr 2027",
      "Próxima tarjeta a pagar",
      "A pagar este mes",
    ])
    expect(screen.getByText(/20\.000\.000/)).toBeTruthy()
    expect(screen.getByText(/3\.000\.000/)).toBeTruthy()
    expect(screen.getByText(/Incluye \$\s*40\.000 vencido/)).toBeTruthy()
    expect(screen.getByText(/480\.000/)).toBeTruthy()
    expect(screen.getByText("Vence en 2 días")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Visa/ }).getAttribute("href")).toBe(
      "/tarjetas/visa?periodo=2026-11",
    )
    expect(screen.getByText("1 resumen más después")).toBeTruthy()
    expect(screen.getByText(/1\.536/)).toBeTruthy()
  })

  it("sin resúmenes impagos lo dice en vez de inventar una fecha", () => {
    render(<KeyFigures {...BASE} nextCardDue={null} />)
    expect(screen.getByText("No hay resúmenes por pagar")).toBeTruthy()
  })
})
