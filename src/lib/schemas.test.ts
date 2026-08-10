import { describe, it, expect } from "vitest"
import type { z } from "zod"

import { buildInstallments } from "@/lib/installments"
import { movementSchema, settingsSchema } from "@/lib/schemas"

const valid = {
  initialBalanceArsCents: "100000",
  initialBalanceUsdCents: "500",
  initialBalanceUsdRate: "1450",
  initialBalanceDate: "2026-08-10",
  preferredRate: "blue",
}

function fieldError(result: { success: boolean; error?: z.ZodError }, field: string) {
  return result.error?.issues.find((issue) => issue.path.join(".") === field)
}

describe("settingsSchema", () => {
  it("acepta una entrada válida", () => {
    const result = settingsSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("convierte los importes a centavos enteros", () => {
    const result = settingsSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.initialBalanceArsCents).toBe(100_000_00)
    expect(result.data.initialBalanceUsdCents).toBe(500_00)
    expect(Number.isInteger(result.data.initialBalanceArsCents)).toBe(true)
    expect(Number.isInteger(result.data.initialBalanceUsdCents)).toBe(true)
  })

  it("rechaza un importe negativo", () => {
    const result = settingsSchema.safeParse({ ...valid, initialBalanceArsCents: "-100" })
    expect(result.success).toBe(false)
  })

  it("rechaza dólares mayores a cero con TC en cero", () => {
    const result = settingsSchema.safeParse({ ...valid, initialBalanceUsdRate: "0" })
    expect(result.success).toBe(false)
    expect(fieldError(result, "initialBalanceUsdRate")).toBeDefined()
  })

  it("rechaza dólares mayores a cero con TC vacío", () => {
    const result = settingsSchema.safeParse({ ...valid, initialBalanceUsdRate: "" })
    expect(result.success).toBe(false)
    expect(fieldError(result, "initialBalanceUsdRate")).toBeDefined()
  })

  it("acepta dólares en cero con TC en cero, sin que el campo estorbe", () => {
    const result = settingsSchema.safeParse({
      ...valid,
      initialBalanceUsdCents: "0",
      initialBalanceUsdRate: "0",
    })
    expect(result.success).toBe(true)
  })

  it("rechaza una fecha con formato inválido", () => {
    const result = settingsSchema.safeParse({ ...valid, initialBalanceDate: "10/08/2026" })
    expect(result.success).toBe(false)
    expect(fieldError(result, "initialBalanceDate")).toBeDefined()
  })

  it("lee el TC del saldo inicial escrito como se escribe acá", () => {
    // "1.450" son mil cuatrocientos cincuenta pesos por dólar. Leerlo como
    // 1,45 valuaría los dólares del saldo inicial en casi nada y arrastraría
    // el TC promedio de toda la posición.
    const result = settingsSchema.safeParse({ ...valid, initialBalanceUsdRate: "1.450" })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.initialBalanceUsdRate).toBe(1450)
  })

  it("rechaza una preferencia de dólar que no está en la lista", () => {
    const result = settingsSchema.safeParse({ ...valid, preferredRate: "turista" })
    expect(result.success).toBe(false)
    expect(fieldError(result, "preferredRate")).toBeDefined()
  })
})

const validMovement = {
  kind: "expense",
  description: "Supermercado",
  categoryId: "cat-1",
  date: "2026-08-10",
  currency: "ARS",
  amountCents: "1500",
  rate: "1",
  installments: [{ amountCents: 150000, dueDate: "2026-08-10" }],
}

describe("movementSchema", () => {
  it("acepta un movimiento de contado en pesos válido", () => {
    const result = movementSchema.safeParse(validMovement)
    expect(result.success).toBe(true)
  })

  it("rechaza cuando la suma de las cuotas da menos que el total", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      installments: [{ amountCents: 149_999, dueDate: "2026-08-10" }],
    })
    expect(result.success).toBe(false)
    expect(fieldError(result, "installments")).toBeDefined()
  })

  it("rechaza cuando la suma de las cuotas da más que el total, aunque sea por un centavo", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      installments: [{ amountCents: 150_001, dueDate: "2026-08-10" }],
    })
    expect(result.success).toBe(false)
    expect(fieldError(result, "installments")).toBeDefined()
  })

  it("acepta un movimiento en cuotas cuya suma cierra, incluido el reparto con resto", () => {
    const plan = buildInstallments(10_000, 3, "2026-08-10")
    // 10.000 / 3 = 3333 / 3333 / 3334: la última cuota absorbe el resto.
    expect(plan.map((i) => i.amountCents)).toEqual([3333, 3333, 3334])

    const result = movementSchema.safeParse({
      ...validMovement,
      amountCents: "100.00",
      installments: plan.map((i) => ({ amountCents: i.amountCents, dueDate: i.dueDate })),
    })
    expect(result.success).toBe(true)
  })

  it("rechaza un movimiento en pesos con un tipo de cambio distinto de 1", () => {
    const result = movementSchema.safeParse({ ...validMovement, rate: "2" })
    expect(result.success).toBe(false)
    expect(fieldError(result, "rate")).toBeDefined()
  })

  it("acepta un movimiento en dólares con tipo de cambio mayor a cero", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      currency: "USD",
      rate: "900",
      amountCents: "100",
      installments: [{ amountCents: 10_000, dueDate: "2026-08-10" }],
    })
    expect(result.success).toBe(true)
  })

  it("lee el TC de un movimiento con el mismo formato que el importe", () => {
    // El campo de TC y el del importe son dos cajas de texto pegadas, en el
    // mismo formulario. Si "1.450" vale 1450 en una y 1,45 en la otra, el
    // movimiento en dólares queda valuado en la milésima parte y nada avisa.
    const usd = {
      ...validMovement,
      currency: "USD",
      amountCents: "100",
      installments: [{ amountCents: 10_000, dueDate: "2026-08-10" }],
    }

    for (const [tipeado, esperado] of [
      ["1.450", 1450],
      ["1.450,50", 1450.5],
      ["1450,50", 1450.5],
      ["1450.50", 1450.5],
    ] as const) {
      const result = movementSchema.safeParse({ ...usd, rate: tipeado })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.rate).toBe(esperado)
    }
  })

  it("rechaza como TC los literales que Number() entiende pero nadie tipea", () => {
    const usd = {
      ...validMovement,
      currency: "USD",
      amountCents: "100",
      installments: [{ amountCents: 10_000, dueDate: "2026-08-10" }],
    }

    for (const tipeado of ["1e3", "0x10", "Infinity", "mil"]) {
      const result = movementSchema.safeParse({ ...usd, rate: tipeado })
      expect(result.success).toBe(false)
      expect(fieldError(result, "rate")).toBeDefined()
    }
  })

  it("rechaza un movimiento en dólares con TC cero", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      currency: "USD",
      rate: "0",
      amountCents: "100",
      installments: [{ amountCents: 10_000, dueDate: "2026-08-10" }],
    })
    expect(result.success).toBe(false)
    expect(fieldError(result, "rate")).toBeDefined()
  })

  it("rechaza un movimiento en dólares con TC negativo", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      currency: "USD",
      rate: "-5",
      amountCents: "100",
      installments: [{ amountCents: 10_000, dueDate: "2026-08-10" }],
    })
    expect(result.success).toBe(false)
    expect(fieldError(result, "rate")).toBeDefined()
  })

  it("rechaza un movimiento sin cuotas", () => {
    const result = movementSchema.safeParse({ ...validMovement, installments: [] })
    expect(result.success).toBe(false)
    expect(fieldError(result, "installments")).toBeDefined()
  })

  it("rechaza un movimiento sin descripción", () => {
    const result = movementSchema.safeParse({ ...validMovement, description: "" })
    expect(result.success).toBe(false)
    expect(fieldError(result, "description")).toBeDefined()
  })

  it("rechaza un movimiento sin categoría", () => {
    const result = movementSchema.safeParse({ ...validMovement, categoryId: "" })
    expect(result.success).toBe(false)
    expect(fieldError(result, "categoryId")).toBeDefined()
  })

  it("rechaza una fecha del movimiento con formato inválido", () => {
    const result = movementSchema.safeParse({ ...validMovement, date: "10/08/2026" })
    expect(result.success).toBe(false)
    expect(fieldError(result, "date")).toBeDefined()
  })

  it("rechaza una fecha de vencimiento con formato inválido", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      installments: [{ amountCents: 150_000, dueDate: "10/08/2026" }],
    })
    expect(result.success).toBe(false)
    expect(fieldError(result, "installments.0.dueDate")).toBeDefined()
  })
})
