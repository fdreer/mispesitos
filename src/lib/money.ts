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
 * Deja un solo separador decimal —el punto— o devuelve null si la combinación
 * de puntos y comas no es ninguno de los formatos que se aceptan.
 */
function normalizeSeparators(text: string): string | null {
  const hasDot = text.includes(".")
  const hasComma = text.includes(",")

  // Con los dos separadores presentes, el ÚLTIMO es el decimal y el otro es de
  // miles, que además tiene que estar en posición de miles. Cubre el formato
  // argentino ("1.234,56") y el inglés ("1,234.56", que es lo que sale de
  // copiar y pegar de una página en inglés o de un resumen en dólares).
  // Cualquier otra mezcla no es un formato: es un error de tipeo y se rechaza.
  //
  // Sin este camino los puntos se borraban vinieran de donde vinieran, así que
  // "1,234.56" se leía como $1,23 —mil veces menos— sin ningún error a la vista.
  if (hasDot && hasComma) {
    if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) {
      return text.replace(/\./g, "").replace(",", ".")
    }
    if (/^[+-]?\d{1,3}(?:,\d{3})+\.\d+$/.test(text)) {
      return text.replace(/,/g, "")
    }
    return null
  }

  // Sola, la coma es siempre el separador decimal: es como se escribe acá.
  if (hasComma) return text.replace(",", ".")

  // Solo, el punto es ambiguo: "1234.56" es decimal pero "1.500" es el formato
  // argentino de mil quinientos. Se desambigua por la cantidad de dígitos que
  // le siguen — tres significa separador de miles.
  return /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text
}

/**
 * Lee un decimal tal como lo tipea una persona: acepta "1.234,56" (formato
 * argentino), "1,234.56" (inglés) y "1234.56" (plano).
 * Devuelve null si no es un número.
 *
 * Es la base de `parseAmountToCents` y también del tipo de cambio: los dos los
 * tipea la misma persona, en el mismo teclado y en campos de texto pegados uno
 * al otro. Leerlos con reglas distintas es lo que hacía que "1.450" fuera mil
 * cuatrocientos cincuenta en el importe y uno con cuarenta y cinco en el TC.
 */
export function parseDecimalInput(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === "") return null

  // Antes de tocar Number(): un número tipeado solo tiene signo, dígitos,
  // puntos y comas. Esto rechaza de raíz cualquier otro literal numérico que
  // Number() sí entendería (hex "0x1F", exponencial "1e3", binario "0b101",
  // "Infinity", "NaN", etc.) — nada de eso es algo que un usuario tipee acá.
  if (!/^[+-]?[\d.,]+$/.test(trimmed)) return null

  const normalized = normalizeSeparators(trimmed)
  if (normalized === null) return null

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/**
 * Lee lo que el usuario tipeó y lo pasa a centavos.
 * Devuelve null si no es un número — la Server Action lo rechaza con Zod.
 */
export function parseAmountToCents(input: string): number | null {
  const value = parseDecimalInput(input)
  if (value === null) return null

  const cents = roundCents(value * 100)
  if (!Number.isSafeInteger(cents)) return null

  return cents
}
