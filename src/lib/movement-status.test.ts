import { describe, it, expect } from "vitest"
import { getMovementStatus } from "@/lib/movement-status"

const TODAY = "2026-08-10"

describe("getMovementStatus", () => {
  it("pagado cuando todas las cuotas están pagadas", () => {
    expect(
      getMovementStatus(
        [
          { paid: true, dueDate: "2026-07-01" },
          { paid: true, dueDate: "2026-08-01" },
        ],
        TODAY,
      ),
    ).toBe("paid")
  })

  it("vencido cuando hay al menos una cuota impaga con vencimiento anterior a hoy", () => {
    expect(
      getMovementStatus(
        [
          { paid: false, dueDate: "2026-08-09" },
          { paid: false, dueDate: "2026-09-01" },
        ],
        TODAY,
      ),
    ).toBe("overdue")
  })

  it("pendiente cuando las cuotas impagas todavía no vencieron", () => {
    expect(
      getMovementStatus(
        [
          { paid: false, dueDate: "2026-08-15" },
          { paid: false, dueDate: "2026-09-01" },
        ],
        TODAY,
      ),
    ).toBe("pending")
  })

  it("una cuota que vence hoy no está vencida (el borde importa)", () => {
    expect(getMovementStatus([{ paid: false, dueDate: TODAY }], TODAY)).toBe("pending")
  })

  it("una cuota pagada tarde no deja el movimiento vencido", () => {
    // La única vencida está paga: ya no se debe nada de ella. Si el estado
    // mirara todas las cuotas en vez de sólo las impagas, este movimiento
    // aparecería en rojo en la lista de vencidos para siempre.
    expect(
      getMovementStatus(
        [
          { paid: true, dueDate: "2026-07-01" },
          { paid: false, dueDate: "2026-09-01" },
        ],
        TODAY,
      ),
    ).toBe("pending")
  })

  it("todas pagadas es pagado aunque todas hayan vencido", () => {
    expect(
      getMovementStatus(
        [
          { paid: true, dueDate: "2025-01-01" },
          { paid: true, dueDate: "2025-02-01" },
        ],
        TODAY,
      ),
    ).toBe("paid")
  })

  it("una sola cuota impaga que venció ayer alcanza para vencido", () => {
    // El borde del otro lado del "vence hoy": un día antes ya es vencido.
    expect(getMovementStatus([{ paid: false, dueDate: "2026-08-09" }], TODAY)).toBe("overdue")
  })

  it("mezcla de cuotas pagadas e impagas vencidas da vencido", () => {
    expect(
      getMovementStatus(
        [
          { paid: true, dueDate: "2026-07-01" },
          { paid: false, dueDate: "2026-08-01" },
          { paid: true, dueDate: "2026-08-15" },
        ],
        TODAY,
      ),
    ).toBe("overdue")
  })
})
