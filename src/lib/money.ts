export type Currency = "ARS" | "USD"

export function roundCents(value: number): number {
  return Math.round(value)
}

export function convertToArs(usdCents: number, rate: number): number {
  return roundCents(usdCents * rate)
}

const FORMATTERS: Record<Currency, Intl.NumberFormat> = {
  ARS: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }),
}

const ZERO_DECIMAL_FORMATTERS: Record<Currency, Intl.NumberFormat> = {
  ARS: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }),
}

export function formatMoney(cents: number, currency: Currency, fractionDigits: 0 | 2 = 2): string {
  const formatter = fractionDigits === 0 ? ZERO_DECIMAL_FORMATTERS[currency] : FORMATTERS[currency]
  return formatter.format(cents / 100)
}

const AXIS_FORMATTER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })

export function formatAxisPesos(pesos: number): string {
  return AXIS_FORMATTER.format(pesos)
}

function normalizeSeparators(text: string): string | null {
  const hasDot = text.includes(".")
  const hasComma = text.includes(",")

  if (hasDot && hasComma) {
    if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) {
      return text.replace(/\./g, "").replace(",", ".")
    }
    if (/^[+-]?\d{1,3}(?:,\d{3})+\.\d+$/.test(text)) {
      return text.replace(/,/g, "")
    }
    return null
  }

  if (hasComma) {
    if (!/,.*,/.test(text)) return text.replace(",", ".")

    return /^[+-]?\d{1,3}(?:,\d{3})+$/.test(text) ? text.replace(/,/g, "") : null
  }

  return /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text
}

export function parseDecimalInput(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === "") return null

  if (!/^[+-]?[\d.,]+$/.test(trimmed)) return null

  const normalized = normalizeSeparators(trimmed)
  if (normalized === null) return null

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function parseAmountToCents(input: string): number | null {
  const value = parseDecimalInput(input)
  if (value === null) return null

  const cents = roundCents(value * 100)
  if (!Number.isSafeInteger(cents)) return null

  return cents
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

export function formatAmountInput(raw: string, previous = ""): string {
  if (raw.length > previous.length + 1) {
    const value = parseDecimalInput(raw)
    if (value !== null && value >= 0) {
      const cents = roundCents(value * 100)
      const integer = groupThousands(String(Math.floor(cents / 100)))
      const decimals = cents % 100
      return decimals === 0 ? integer : `${integer},${String(decimals).padStart(2, "0")}`
    }
  }

  let text = raw.replace(/[^\d.,]/g, "")
  if (!text.includes(",") && text.endsWith(".")) {
    text = `${text.slice(0, -1)},`
  }

  const commaAt = text.indexOf(",")
  const integerDigits = (commaAt === -1 ? text : text.slice(0, commaAt))
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
  if (commaAt === -1) return groupThousands(integerDigits)

  const decimals = text.slice(commaAt + 1).replace(/\D/g, "").slice(0, 2)
  return `${groupThousands(integerDigits) || "0"},${decimals}`
}

export function centsToAmountInput(cents: number | null): string {
  if (cents === null) return ""
  return formatAmountInput((cents / 100).toFixed(2).replace(".", ","))
}
