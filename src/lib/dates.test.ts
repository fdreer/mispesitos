import { describe, it, expect, vi, afterEach } from "vitest"
import { todayInAr, addMonthsClamped, isValidIsoDate, monthKey, isOverdue } from "@/lib/dates"

afterEach(() => {
  vi.useRealTimers()
})

describe("todayInAr", () => {
  it("devuelve una fecha en formato YYYY-MM-DD", () => {
    expect(todayInAr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("usa el día de Buenos Aires, no el de UTC", () => {
    // 01:30 UTC del 10 son las 22:30 del 9 en Buenos Aires (UTC-3).
    // Una implementación que lea UTC o la hora local del servidor devuelve el 10.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-10T01:30:00Z"))

    expect(todayInAr()).toBe("2026-08-09")
  })
})

describe("addMonthsClamped", () => {
  it("suma meses manteniendo el día", () => {
    expect(addMonthsClamped("2026-01-15", 1)).toBe("2026-02-15")
    expect(addMonthsClamped("2026-01-15", 12)).toBe("2027-01-15")
  })

  it("recorta al último día cuando el día no existe en el mes destino", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonthsClamped("2026-08-31", 1)).toBe("2026-09-30")
  })

  it("respeta los años bisiestos", () => {
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29")
  })

  it("cruza el año correctamente", () => {
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28")
  })

  it("no convierte un año de dos dígitos en uno del siglo XX", () => {
    expect(addMonthsClamped("0025-08-09", 0)).toBe("0025-08-09")
    expect(addMonthsClamped("0099-01-15", 1)).toBe("0099-02-15")
  })

  it("rechaza una fecha que no es YYYY-MM-DD en vez de devolver NaN", () => {
    expect(() => addMonthsClamped("hoy", 1)).toThrow()
    expect(() => addMonthsClamped("2026-08-09T00:00:00Z", 1)).toThrow()
    expect(() => addMonthsClamped("", 1)).toThrow()
  })

  it("rechaza un día que no existe en vez de fabricar otra fecha", () => {
    // Tienen la forma correcta y no son días. Antes salían de acá convertidas
    // en silencio: "2026-13-45" en "2027-01-31" y "2026-00-00" en "2026-01-00",
    // que ni siquiera es una fecha.
    expect(() => addMonthsClamped("2026-02-30", 1)).toThrow()
    expect(() => addMonthsClamped("2026-13-45", 1)).toThrow()
    expect(() => addMonthsClamped("2026-00-00", 1)).toThrow()
  })

  it("resta meses y cruza el año hacia atrás", () => {
    // El dashboard arma la ventana de meses pasados con `months` negativos.
    expect(addMonthsClamped("2026-01-15", -3)).toBe("2025-10-15")
    expect(addMonthsClamped("2026-01-31", -2)).toBe("2025-11-30")
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28")
  })

  it("acepta cero meses", () => {
    expect(addMonthsClamped("2026-05-10", 0)).toBe("2026-05-10")
  })
})

describe("isValidIsoDate", () => {
  it("acepta días que existen, incluido el 29 de febrero bisiesto", () => {
    expect(isValidIsoDate("2026-08-10")).toBe(true)
    expect(isValidIsoDate("2028-02-29")).toBe(true)
    expect(isValidIsoDate("2026-01-31")).toBe(true)
    expect(isValidIsoDate("0025-08-09")).toBe(true)
  })

  it("rechaza días que no existen aunque tengan la forma correcta", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false) // 2026 no es bisiesto
    expect(isValidIsoDate("2026-02-30")).toBe(false)
    expect(isValidIsoDate("2026-04-31")).toBe(false)
    expect(isValidIsoDate("2026-13-01")).toBe(false)
    expect(isValidIsoDate("2026-00-10")).toBe(false)
    expect(isValidIsoDate("2026-08-00")).toBe(false)
  })

  it("rechaza lo que no tiene la forma YYYY-MM-DD", () => {
    expect(isValidIsoDate("10/08/2026")).toBe(false)
    expect(isValidIsoDate("2026-8-10")).toBe(false)
    expect(isValidIsoDate("2026-08-10T00:00:00Z")).toBe(false)
    expect(isValidIsoDate("")).toBe(false)
  })
})

describe("monthKey", () => {
  it("extrae el año y mes", () => {
    expect(monthKey("2026-08-09")).toBe("2026-08")
  })
})

describe("isOverdue", () => {
  it("es vencido si la fecha ya pasó", () => {
    expect(isOverdue("2026-08-08", "2026-08-09")).toBe(true)
  })

  it("no es vencido si vence hoy", () => {
    expect(isOverdue("2026-08-09", "2026-08-09")).toBe(false)
  })

  it("no es vencido si vence en el futuro", () => {
    expect(isOverdue("2026-09-01", "2026-08-09")).toBe(false)
  })
})
