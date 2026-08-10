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
