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

/** "1234567" -> "1.234.567". Sólo dígitos. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

/**
 * Lo que se ve en el campo de importe mientras se escribe (§5.2 del plan v2):
 * los miles separados con punto y la coma decimal, con dos decimales como
 * mucho. "1500000" se ve "1.500.000" a medida que se tipea.
 *
 * Los puntos que hay en el texto son los que puso esta misma función, así que
 * al tipear se descartan y se vuelven a poner. Dos excepciones:
 *
 * - Un punto recién tipeado al final, sin coma en el texto, es la tecla
 *   decimal de un teclado en inglés (o del teclado numérico): se toma como
 *   coma. Sin esto, "12." seguido de "5" daba 125.
 * - Un texto PEGADO (entra más de un carácter de golpe respecto de
 *   `previous`) no lo formateó nadie: puede ser "1,234.56" copiado de una
 *   página en inglés. Se lee con `parseDecimalInput`, que entiende todos los
 *   formatos que acepta la app, y se reescribe. Leído como tipeo, ese punto
 *   decimal se borraba y el importe quedaba cien veces más grande.
 *
 * Lo que sale lo vuelve a leer `parseAmountToCents` sin ambigüedad: miles con
 * punto y decimales con coma.
 */
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
