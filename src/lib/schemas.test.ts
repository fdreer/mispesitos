import { describe, it, expect } from "vitest"

import { buildInstallments } from "@/lib/installments"
import { movementSchema, settingsSchema } from "@/lib/schemas"

const valid = {
  initialBalanceArsCents: "100000",
  initialBalanceUsdCents: "500",
  initialBalanceUsdRate: "1450",
  initialBalanceDate: "2026-08-10",
  preferredRate: "blue",
}

function fieldError(result: ReturnType<typeof settingsSchema.safeParse>, field: string) {
  if (result.success) return undefined
  return result.error.issues.find((issue) => issue.path.join(".") === field)
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

function movementFieldError(
  result: ReturnType<typeof movementSchema.safeParse>,
  field: string,
) {
  if (result.success) return undefined
  return result.error.issues.find((issue) => issue.path.join(".") === field)
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
    expect(movementFieldError(result, "installments")).toBeDefined()
  })

  it("rechaza cuando la suma de las cuotas da más que el total, aunque sea por un centavo", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      installments: [{ amountCents: 150_001, dueDate: "2026-08-10" }],
    })
    expect(result.success).toBe(false)
    expect(movementFieldError(result, "installments")).toBeDefined()
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
    expect(movementFieldError(result, "rate")).toBeDefined()
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

  it("rechaza un movimiento en dólares con TC cero", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      currency: "USD",
      rate: "0",
      amountCents: "100",
      installments: [{ amountCents: 10_000, dueDate: "2026-08-10" }],
    })
    expect(result.success).toBe(false)
    expect(movementFieldError(result, "rate")).toBeDefined()
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
    expect(movementFieldError(result, "rate")).toBeDefined()
  })

  it("rechaza un movimiento sin cuotas", () => {
    const result = movementSchema.safeParse({ ...validMovement, installments: [] })
    expect(result.success).toBe(false)
    expect(movementFieldError(result, "installments")).toBeDefined()
  })

  it("rechaza un movimiento sin descripción", () => {
    const result = movementSchema.safeParse({ ...validMovement, description: "" })
    expect(result.success).toBe(false)
    expect(movementFieldError(result, "description")).toBeDefined()
  })

  it("rechaza un movimiento sin categoría", () => {
    const result = movementSchema.safeParse({ ...validMovement, categoryId: "" })
    expect(result.success).toBe(false)
    expect(movementFieldError(result, "categoryId")).toBeDefined()
  })

  it("rechaza una fecha del movimiento con formato inválido", () => {
    const result = movementSchema.safeParse({ ...validMovement, date: "10/08/2026" })
    expect(result.success).toBe(false)
    expect(movementFieldError(result, "date")).toBeDefined()
  })

  it("rechaza una fecha de vencimiento con formato inválido", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      installments: [{ amountCents: 150_000, dueDate: "10/08/2026" }],
    })
    expect(result.success).toBe(false)
    expect(movementFieldError(result, "installments.0.dueDate")).toBeDefined()
  })
})
