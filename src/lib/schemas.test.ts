import { describe, it, expect } from "vitest"

import { settingsSchema } from "@/lib/schemas"

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
