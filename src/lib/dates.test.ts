import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import {
  todayInAr,
  addMonthsClamped,
  addDaysIso,
  diffDaysIso,
  monthRange,
  formatMonthLabel,
  formatRelativeDue,
  isValidIsoDate,
  monthKey,
  isOverdue,
  isoToDate,
  dateToIso,
} from "@/lib/dates"

afterEach(() => {
  vi.useRealTimers()
})

describe("todayInAr", () => {
  it("devuelve una fecha en formato YYYY-MM-DD", () => {
    expect(todayInAr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("usa el día de Buenos Aires, no el de UTC", () => {
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
    expect(() => addMonthsClamped("2026-02-30", 1)).toThrow()
    expect(() => addMonthsClamped("2026-13-45", 1)).toThrow()
    expect(() => addMonthsClamped("2026-00-00", 1)).toThrow()
  })

  it("resta meses y cruza el año hacia atrás", () => {
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
    expect(isValidIsoDate("2026-02-29")).toBe(false)
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

describe("isoToDate / dateToIso", () => {
  const ORIGINAL_TZ = process.env.TZ
  beforeEach(() => {
    process.env.TZ = "America/Argentina/Buenos_Aires"
  })
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ
  })

  it("hace un round-trip sin cambiar el día", () => {
    expect(dateToIso(isoToDate("2026-08-11"))).toBe("2026-08-11")
    expect(dateToIso(isoToDate("2026-01-01"))).toBe("2026-01-01")
  })

  it("el día que se elige no se corre: getDate() local coincide con el día del string", () => {
    const date = isoToDate("2026-01-01")
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(0)
    expect(date.getDate()).toBe(1)
  })

  it("dateToIso lee componentes locales, no UTC", () => {
    const local = new Date(2026, 0, 1)
    expect(dateToIso(local)).toBe("2026-01-01")

    process.env.TZ = "Europe/Berlin"
    const localBerlin = new Date(2026, 0, 1)
    expect(dateToIso(localBerlin)).toBe("2026-01-01")
  })

  it("rechaza una fecha inválida en vez de fabricar un Date roto (misma postura que addMonthsClamped)", () => {
    expect(() => isoToDate("2026-02-30")).toThrow()
    expect(() => isoToDate("hoy")).toThrow()
    expect(() => isoToDate("")).toThrow()
    expect(() => isoToDate("2026-08-09T00:00:00Z")).toThrow()
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

describe("addDaysIso / diffDaysIso", () => {
  it("suma y resta días cruzando meses y años bisiestos", () => {
    expect(addDaysIso("2026-01-30", 3)).toBe("2026-02-02")
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDaysIso("2026-01-02", -3)).toBe("2025-12-30")
    expect(diffDaysIso("2026-02-02", "2026-01-30")).toBe(3)
    expect(diffDaysIso("2026-01-28", "2026-01-30")).toBe(-2)
  })
})

describe("monthRange / formatMonthLabel", () => {
  it("devuelve el primer y último día de cada mes incluyendo febrero bisiesto", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" })
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" })
  })

  it("formatea el mes en español", () => {
    expect(formatMonthLabel("2026-11")).toBe("Noviembre 2026")
    expect(formatMonthLabel("2027-01")).toBe("Enero 2027")
  })
})

describe("formatRelativeDue", () => {
  const HOY = "2026-11-26"

  it("usa texto relativo dentro de los 14 días", () => {
    expect(formatRelativeDue("2026-11-26", HOY, "26/11")).toBe("vence hoy")
    expect(formatRelativeDue("2026-11-27", HOY, "27/11")).toBe("vence mañana")
    expect(formatRelativeDue("2026-11-29", HOY, "29/11")).toBe("vence en 3 días")
    expect(formatRelativeDue("2026-11-25", HOY, "25/11")).toBe("venció ayer")
    expect(formatRelativeDue("2026-11-24", HOY, "24/11")).toBe("venció hace 2 días")
  })

  it("más allá de 14 días muestra la fecha corta", () => {
    expect(formatRelativeDue("2026-12-15", HOY, "15/12")).toBe("vence 15/12")
    expect(formatRelativeDue("2026-11-01", HOY, "01/11")).toBe("venció 01/11")
  })
})
