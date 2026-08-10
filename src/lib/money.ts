export type Currency = "ARS" | "USD"

/**
 * Redondeo al centavo. Medio hacia arriba, según la sección 5.0 del spec.
 * Es el único redondeo de plata de toda la app.
 */
export function roundCents(value: number): number {
  return Math.round(value)
}

/**
 * Convierte centavos de dólar a centavos de peso.
 * Es la ÚNICA función que multiplica un importe por una cotización.
 */
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

export function formatMoney(cents: number, currency: Currency): string {
  return FORMATTERS[currency].format(cents / 100)
}

/**
 * Lee lo que el usuario tipeó y lo pasa a centavos.
 * Acepta "1.234,56" (formato argentino) y "1234.56".
 * Devuelve null si no es un número — la Server Action lo rechaza con Zod.
 */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === "") return null

  // Si tiene coma, la coma es el separador decimal y los puntos son de miles.
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null

  return roundCents(value * 100)
}
