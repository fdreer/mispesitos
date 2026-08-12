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
 * Un tick de eje de gráfico. Recibe PESOS enteros, no centavos: es la unidad
 * que los gráficos grafican (ver `toPesos` en @/components/dashboard/charts).
 *
 * Sin símbolo de moneda —el título de la tarjeta ya dice de qué habla y el
 * tooltip lo repite con `formatMoney`— pero con los separadores de acá: los
 * ejes salían con el formato del default de Recharts ("1200000") mientras el
 * resto de la app escribe "1.200.000".
 */
const AXIS_FORMATTER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })

export function formatAxisPesos(pesos: number): string {
  return AXIS_FORMATTER.format(pesos)
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

  if (hasComma) {
    // Una sola coma es siempre el separador decimal: es como se escribe acá.
    // "1,234" son $1,23. La ambigüedad con el formato inglés es real y se
    // resuelve a favor de es-AR a propósito: leerla como miles rompería "1,5".
    if (!/,.*,/.test(text)) return text.replace(",", ".")

    // Con MÁS DE UNA coma no hay ambigüedad posible: ningún decimal lleva dos
    // comas, así que sólo pueden ser separadores de miles —y como en la rama
    // del punto, tienen que agrupar de a tres para ser un formato y no un error
    // de tipeo. Es el espejo de "1.234.567", que ya se leía bien; sin esto,
    // "1,234,567" devolvía null porque la rama inglesa de arriba exige un
    // decimal final.
    return /^[+-]?\d{1,3}(?:,\d{3})+$/.test(text) ? text.replace(/,/g, "") : null
  }

  // Solo, el punto es ambiguo: "1234.56" es decimal pero "1.500" es el formato
  // argentino de mil quinientos. Se desambigua por la cantidad de dígitos que
  // le siguen — tres significa separador de miles.
  return /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text
}

/**
 * Lee un decimal tal como lo tipea una persona: acepta "1.234,56" (formato
 * argentino), "1,234.56" (inglés), "1.234.567" y "1,234,567" (miles sin
 * decimales, en cualquiera de los dos) y "1234.56" (plano).
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
