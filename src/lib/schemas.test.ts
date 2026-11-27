import { describe, it, expect } from "vitest"
import type { z } from "zod"

import { buildInstallments } from "@/lib/installments"
import { exchangeSchema, movementSchema, settingsSchema } from "@/lib/schemas"

const valid = {
  initialBalanceArsCents: "100000",
  initialBalanceUsdCents: "500",
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

  it("sigue admitiendo un saldo inicial en cero", () => {
    const result = settingsSchema.safeParse({
      initialBalanceArsCents: "0",
      initialBalanceUsdCents: "0",
      initialBalanceDate: "2026-08-10",
      preferredRate: "blue",
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
  installments: [{ amountCents: 150000, dueDate: "2026-08-10" }],
}

describe("movementSchema", () => {
  it("acepta un movimiento de contado en pesos válido", () => {
    const result = movementSchema.safeParse(validMovement)
    expect(result.success).toBe(true)
  })

  it("acepta un movimiento en dólares sin tipo de cambio", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      currency: "USD",
      amountCents: "100",
      installments: [{ amountCents: 10_000, dueDate: "2026-08-10" }],
    })
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
    expect(plan.map((i) => i.amountCents)).toEqual([3333, 3333, 3334])

    const result = movementSchema.safeParse({
      ...validMovement,
      amountCents: "100.00",
      installments: plan.map((i) => ({ amountCents: i.amountCents, dueDate: i.dueDate })),
    })
    expect(result.success).toBe(true)
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

  it("rechaza una fecha que tiene la forma correcta pero no existe", () => {
    for (const fecha of ["2026-02-30", "2026-02-29", "2026-13-01", "2026-08-00"]) {
      const result = movementSchema.safeParse({ ...validMovement, date: fecha })
      expect(result.success).toBe(false)
      expect(fieldError(result, "date")).toBeDefined()
    }
  })

  it("acepta el 29 de febrero de un año bisiesto", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      date: "2028-02-29",
      installments: [{ amountCents: 150_000, dueDate: "2028-02-29" }],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza un vencimiento que no existe, apuntando a la cuota", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      installments: [{ amountCents: 150_000, dueDate: "2026-04-31" }],
    })
    expect(result.success).toBe(false)
    expect(fieldError(result, "installments.0.dueDate")).toBeDefined()
  })

  it("rechaza una fecha de vencimiento con formato inválido", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      installments: [{ amountCents: 150_000, dueDate: "10/08/2026" }],
    })
    expect(result.success).toBe(false)
    expect(fieldError(result, "installments.0.dueDate")).toBeDefined()
  })

  it("acepta exactamente 120 cuotas", () => {
    const installments = Array.from({ length: 120 }, (_, i) => ({
      amountCents: i === 119 ? 10_000 - 119 * 83 : 83,
      dueDate: "2026-08-10",
    }))
    const total = installments.reduce((a, i) => a + i.amountCents, 0)

    const result = movementSchema.safeParse({
      kind: "expense",
      description: "Cuotas al límite",
      categoryId: "cat-1",
      date: "2026-08-10",
      currency: "ARS",
      amountCents: String(total / 100),
      installments,
    })

    expect(result.success).toBe(true)
  })

  it("rechaza un movimiento de importe cero", () => {
    const result = movementSchema.safeParse({
      kind: "expense",
      description: "Nada",
      categoryId: "cat-1",
      date: "2026-08-10",
      currency: "ARS",
      amountCents: "0",
      installments: [{ amountCents: 0, dueDate: "2026-08-10" }],
    })

    expect(result.success).toBe(false)
    expect(fieldError(result, "amountCents")).toBeDefined()
  })

  it("rechaza 121 cuotas", () => {
    const installments = Array.from({ length: 121 }, () => ({
      amountCents: 100,
      dueDate: "2026-08-10",
    }))

    const result = movementSchema.safeParse({
      kind: "expense",
      description: "Una cuota de más",
      categoryId: "cat-1",
      date: "2026-08-10",
      currency: "ARS",
      amountCents: "121",
      installments,
    })

    expect(result.success).toBe(false)
    expect(fieldError(result, "installments")).toBeDefined()
  })

  it("rechaza una cuota con importe vacío en lugar de convertirlo en 0", () => {
    const result = movementSchema.safeParse({
      ...validMovement,
      installments: [{ amountCents: "", dueDate: "2026-08-10" }],
    })
    expect(result.success).toBe(false)
    expect(fieldError(result, "installments.0.amountCents")).toBeDefined()
  })
})

describe("exchangeSchema", () => {
  const base = { direction: "buy", date: "2026-08-10", usdCents: "100", rate: "1450" }

  it("lee el TC con el mismo formato que el importe", () => {
    for (const [tipeado, esperado] of [
      ["1.450", 1450],
      ["1.450,50", 1450.5],
      ["1450,50", 1450.5],
      ["1450.50", 1450.5],
    ] as const) {
      const result = exchangeSchema.safeParse({ ...base, rate: tipeado })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.rate).toBe(esperado)
    }
  })

  it("rechaza literales no válidos, cero o negativos como TC", () => {
    for (const tipeado of ["1e3", "0x10", "Infinity", "mil", "0", "-5"]) {
      const result = exchangeSchema.safeParse({ ...base, rate: tipeado })
      expect(result.success).toBe(false)
      expect(fieldError(result, "rate")).toBeDefined()
    }
  })

  it("rechaza un TC con más dígitos o decimales de los que entran en la columna", () => {
    for (const tipeado of ["100000000", "100.000.000", "999999999,5"]) {
      const result = exchangeSchema.safeParse({ ...base, rate: tipeado })
      expect(result.success).toBe(false)
      expect(fieldError(result, "rate")?.message).toBe(
        "El tipo de cambio no puede pasar de 99.999.999,9999.",
      )
    }
    for (const tipeado of ["1450,75259", "1,00001", "0,123456"]) {
      const result = exchangeSchema.safeParse({ ...base, rate: tipeado })
      expect(result.success).toBe(false)
      expect(fieldError(result, "rate")?.message).toBe(
        "El tipo de cambio admite hasta cuatro decimales.",
      )
    }
  })

  it("acepta el TC más grande y más preciso que la columna sí guarda", () => {
    const result = exchangeSchema.safeParse({ ...base, rate: "99.999.999,9999" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.rate).toBe(99_999_999.9999)
  })
})
