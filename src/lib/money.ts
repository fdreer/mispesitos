export type Currency = "ARS" | "USD"

/**
 * Redondeo al centavo. Medio hacia arriba, según la sección 5.0 del spec.
 * Nota: "hacia arriba" es hacia +Infinito, no "lejos de cero" — en negativos,
 * -10.5 redondea a -10 (no a -11). Es el comportamiento de Math.round y no cambia.
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

  // Antes de tocar Number(): un importe tipeado solo tiene signo, dígitos,
  // puntos y comas. Esto rechaza de raíz cualquier otro literal numérico que
  // Number() sí entendería (hex "0x1F", exponencial "1e3", binario "0b101",
  // "Infinity", "NaN", etc.) — nada de eso es algo que un usuario tipee acá.
  if (!/^[+-]?[\d.,]+$/.test(trimmed)) return null

  // Si tiene coma, la coma es el separador decimal y los puntos son de miles.
  // Sin coma, un punto es ambiguo: "1234.56" es decimal pero "1.500" es el
  // formato argentino de mil quinientos. Se desambigua por la cantidad de
  // dígitos que le siguen — tres significa separador de miles.
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : /^[+-]?\d{1,3}(\.\d{3})+$/.test(trimmed)
      ? trimmed.replace(/\./g, "")
      : trimmed

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null

  const cents = roundCents(value * 100)
  if (!Number.isSafeInteger(cents)) return null

  return cents
}
