import { describe, it, expect } from "vitest"
import {
  roundCents,
  convertToArs,
  formatMoney,
  parseAmountToCents,
  parseDecimalInput,
} from "@/lib/money"

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
    expect(parseAmountToCents("1.500")).toBe(150_000)
    expect(parseAmountToCents(" 250 ")).toBe(25_000)
    expect(parseAmountToCents("0,01")).toBe(1)
  })

  it("sin coma, un punto seguido de tres dígitos es separador de miles", () => {
    expect(parseAmountToCents("1.500")).toBe(150_000)
    expect(parseAmountToCents("1.234.567")).toBe(123_456_700)
    expect(parseAmountToCents("-2.000")).toBe(-200_000)
  })

  it("sin coma, un punto que no separa miles sigue siendo decimal", () => {
    expect(parseAmountToCents("1234.56")).toBe(123_456)
    expect(parseAmountToCents("0.5")).toBe(50)
    // Cuatro dígitos después del punto no son miles: son 12,3456 pesos.
    expect(parseAmountToCents("12.3456")).toBe(1_235)
  })

  it("con los dos separadores, el último es el decimal", () => {
    // "1,234.56" es lo que sale de copiar y pegar de una página en inglés o de
    // un resumen en dólares. Son $1.234,56, no $1,23.
    expect(parseAmountToCents("1,234.56")).toBe(123_456)
    expect(parseAmountToCents("1,234,567.89")).toBe(123_456_789)
    // Y el formato de acá sigue leyéndose igual.
    expect(parseAmountToCents("1.234,56")).toBe(123_456)
    expect(parseAmountToCents("1.234.567,89")).toBe(123_456_789)
  })

  it("rechaza mezclas de puntos y comas que no son ningún formato, en vez de inventar un importe", () => {
    // Son errores de tipeo. Devolver null hace que el formulario pida
    // corregirlo; adivinar guardaría un importe que el usuario nunca escribió.
    expect(parseAmountToCents("1.234,56.78")).toBeNull()
    expect(parseAmountToCents("1,234.567.89")).toBeNull()
    expect(parseAmountToCents("1,50.5")).toBeNull()
    expect(parseAmountToCents("1.5,50")).toBeNull()
  })

  it("acepta hasta el máximo entero seguro y rechaza el centavo siguiente", () => {
    // El borde de los dos lados: 9.007.199.254.740.991 centavos entran,
    // uno más ya no se puede representar sin perder centavos.
    expect(parseAmountToCents("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseAmountToCents("90071992547409.92")).toBeNull()
  })

  it("rechaza separadores de miles que no agrupan de a tres", () => {
    expect(parseAmountToCents("1.23.456")).toBeNull()
    expect(parseAmountToCents("12,34,567")).toBeNull()
  })

  it("rechaza espacios y símbolos adentro del número", () => {
    // El espacio de miles y el signo pesos se pegan de cualquier lado.
    expect(parseAmountToCents("1 500")).toBeNull()
    expect(parseAmountToCents("1 500")).toBeNull()
    expect(parseAmountToCents("$1500")).toBeNull()
    expect(parseAmountToCents("1500,-")).toBeNull()
    expect(parseAmountToCents("１５００")).toBeNull()
  })
})

describe("parseDecimalInput", () => {
  it("lee el mismo decimal escrito en formato argentino, inglés o plano", () => {
    expect(parseDecimalInput("1.234,56")).toBe(1234.56)
    expect(parseDecimalInput("1,234.56")).toBe(1234.56)
    expect(parseDecimalInput("1234.56")).toBe(1234.56)
  })

  it("un tipo de cambio escrito como se escribe acá vale lo que dice", () => {
    // El caso que importa: "1.450" son mil cuatrocientos cincuenta pesos por
    // dólar. Leerlo como 1,45 valúa cien dólares en un peso con cuarenta y cinco.
    expect(parseDecimalInput("1.450")).toBe(1450)
    expect(parseDecimalInput("1.450,50")).toBe(1450.5)
    expect(parseDecimalInput("1450,50")).toBe(1450.5)
  })

  it("no arrastra el redondeo al centavo: devuelve el decimal tal cual", () => {
    expect(parseDecimalInput("1234,5678")).toBe(1234.5678)
  })

  it("rechaza lo que Number() aceptaría pero nadie tipea", () => {
    expect(parseDecimalInput("1e3")).toBeNull()
    expect(parseDecimalInput("0x1F")).toBeNull()
    expect(parseDecimalInput("Infinity")).toBeNull()
    expect(parseDecimalInput("")).toBeNull()
    expect(parseDecimalInput("   ")).toBeNull()
  })
})
