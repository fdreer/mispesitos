// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ReportControls } from "@/components/reports/report-controls"
import { parseReportQuery } from "@/lib/report-query"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
  push.mockClear()
})

describe("ReportControls", () => {
  it("cambia de pestaña y moneda preservando filtros compartidos", () => {
    const query = parseReportQuery({
      moneda: "ARS",
      categoryId: "hogar",
      from: "2026-01-01",
      to: "2026-12-31",
    })

    render(<ReportControls query={query} />)

    const flujoLink = screen.getByRole("link", { name: "Flujo de caja" })
    // Al ir a Flujo de caja descarta categoryId pero conserva moneda y período.
    expect(flujoLink.getAttribute("href")).toBe(
      "/informes?tab=flujo&moneda=ARS&from=2026-01-01&to=2026-12-31",
    )

    fireEvent.click(screen.getByRole("radio", { name: "USD" }))
    expect(push).toHaveBeenCalledWith(
      "/informes?moneda=USD&categoryId=hogar&from=2026-01-01&to=2026-12-31",
    )
  })

  it("muestra selector de granularidad sólo en Flujo de caja", () => {
    render(<ReportControls query={parseReportQuery({})} />)
    expect(screen.queryByRole("radiogroup", { name: "Granularidad" })).toBeNull()

    cleanup()
    render(<ReportControls query={parseReportQuery({ tab: "flujo" })} />)
    expect(screen.getByRole("radiogroup", { name: "Granularidad" })).toBeTruthy()

    fireEvent.click(screen.getByRole("radio", { name: "Semanal (3 meses)" }))
    expect(push).toHaveBeenCalledWith("/informes?tab=flujo&granularidad=semanal")
  })
})
