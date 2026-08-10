import { describe, it, expect } from "vitest"
import { roundCents, convertToArs, formatMoney, parseAmountToCents } from "@/lib/money"

describe("roundCents", () => {
  it("redondea al entero más cercano", () => {
    expect(roundCents(10.4)).toBe(10)
    expect(roundCents(10.6)).toBe(11)
  })

  it("redondea el medio hacia arriba", () => {
    expect(roundCents(10.5)).toBe(11)
  })

  it("en negativos redondea el medio hacia +Infinito, no lejos de cero", () => {
    expect(roundCents(-10.5)).toBe(-10)
  })
})

describe("convertToArs", () => {
  it("convierte centavos de dólar a centavos de peso", () => {
    // USD 100,00 a 1.450,00 => ARS 145.000,00
    expect(convertToArs(10_000, 1450)).toBe(14_500_000)
  })

  it("redondea al centavo cuando el TC tiene decimales", () => {
    // 1 centavo de dólar a 1234,5678 => 1234,5678 centavos => 1235
    expect(convertToArs(1, 1234.5678)).toBe(1235)
  })

  it("devuelve cero cuando no hay dólares", () => {
    expect(convertToArs(0, 1450)).toBe(0)
  })
})

describe("formatMoney", () => {
  it("formatea pesos en es-AR", () => {
    expect(formatMoney(14_500_000, "ARS")).toBe("$ 145.000,00")
  })

  it("formatea dólares", () => {
    expect(formatMoney(10_000, "USD")).toBe("US$ 100,00")
  })

  it("formatea negativos", () => {
    expect(formatMoney(-5000, "ARS")).toBe("-$ 50,00")
  })
})

describe("parseAmountToCents", () => {
  it("acepta coma decimal", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123_456)
  })

  it("acepta punto decimal", () => {
    expect(parseAmountToCents("1234.56")).toBe(123_456)
  })

  it("acepta enteros", () => {
    expect(parseAmountToCents("1500")).toBe(150_000)
  })

  it("rechaza texto no numérico", () => {
    expect(parseAmountToCents("abc")).toBeNull()
    expect(parseAmountToCents("")).toBeNull()
  })

  it("rechaza literales numéricos de JS que no son un importe tipeado (hex, exponencial, binario)", () => {
    expect(parseAmountToCents("0x1F")).toBeNull()
    expect(parseAmountToCents("1e3")).toBeNull()
    expect(parseAmountToCents("0b101")).toBeNull()
  })

  it("rechaza valores que superan el rango seguro de enteros", () => {
    expect(parseAmountToCents("99999999999999999")).toBeNull()
  })

  it("acepta signo negativo (el rechazo de negativos queda para Zod .positive() en la Server Action)", () => {
    expect(parseAmountToCents("-1500")).toBe(-150_000)
  })

  it("sigue aceptando los formatos reales que tipean usuarios argentinos", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123_456)
    expect(parseAmountToCents("1234.56")).toBe(123_456)
    expect(parseAmountToCents("1500")).toBe(150_000)
    expect(parseAmountToCents("1.500")).not.toBeNull()
    expect(parseAmountToCents(" 250 ")).toBe(25_000)
    expect(parseAmountToCents("0,01")).toBe(1)
  })
})
