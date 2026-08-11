import { z } from "zod"

import { isValidIsoDate } from "@/lib/dates"
import { installmentsSumMatches, MAX_INSTALLMENTS } from "@/lib/installments"
import { parseAmountToCents, parseDecimalInput } from "@/lib/money"

/** Importe tipeado por el usuario, convertido a centavos enteros. */
export const amountCents = z
  .string()
  .transform((value, ctx) => {
    const cents = parseAmountToCents(value)
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Escribí un importe válido." })
      return z.NEVER
    }
    return cents
  })
  .refine((cents) => cents >= 0, { message: "El importe no puede ser negativo." })

/**
 * Fecha de negocio. El formato solo no alcanza: "2026-02-30" lo cumple y no es
 * un día. Sin este chequeo el 30 de febrero llegaba hasta el INSERT, donde la
 * columna `date` lo rechaza, y el usuario veía "No pudimos guardar el
 * movimiento" en vez de "Elegí una fecha válida" en el campo de la fecha.
 */
export const isoDate = z.string().refine(isValidIsoDate, "Elegí una fecha válida.")

export const ratePreference = z.enum(["oficial", "blue", "mep"])

/**
 * Lo que entra en `numeric(12,4)`, el tipo de las DOS columnas donde termina un
 * tipo de cambio: `movement.rate` y `user_settings.initial_balance_usd_rate`.
 * Doce dígitos en total, cuatro después de la coma, así que 99.999.999,9999 es
 * el número más grande y más preciso que la columna guarda.
 *
 * La cota la da la columna, no una regla de negocio inventada: si se toca la
 * precisión de las columnas hay que tocar esto —y el literal del mensaje de
 * abajo, que es el mismo número escrito para que lo lea una persona—, y al revés.
 */
const RATE_MAX = 99_999_999.9999
const RATE_SCALE = 4

/**
 * Tipo de cambio: pesos por dólar. NO es un importe en centavos —es un decimal
 * común, así que no pasa por amountCents— pero lo tipea la misma persona, en el
 * mismo teclado y en un campo de texto pegado al del importe, así que se lee
 * con el mismo parser.
 *
 * Con `z.coerce.number()`, que por debajo es `Number()`, "1.450" se leía como
 * 1,45 pesos por dólar y "1.450,50" no se leía en absoluto.
 *
 * Las dos cotas de abajo viven acá, en la pieza compartida, para que las hereden
 * tanto `exchangeRate` como `positiveRate`: las dos escriben en columnas
 * `numeric(12,4)` y sólo se diferencian en si admiten cero.
 */
const typedRate = z
  .string()
  .transform((value, ctx) => {
    const parsed = parseDecimalInput(value)
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "Escribí un tipo de cambio válido." })
      return z.NEVER
    }
    return parsed
  })
  /**
   * Sin esta cota, un TC de 9 dígitos desbordaba `numeric(12,4)`: Postgres
   * rechazaba el INSERT y el usuario veía el mensaje genérico de "no pudimos
   * guardar", sin ninguna pista de cuál era el campo.
   */
  .refine((rate) => Math.abs(rate) <= RATE_MAX, {
    message: "El tipo de cambio no puede pasar de 99.999.999,9999.",
  })
  /**
   * Y sin ésta, un TC con más decimales de los que la columna guarda entraba sin
   * error: Postgres lo redondeaba EN SILENCIO y quedaba guardado un número
   * distinto del que la persona escribió ("1450,75259" se volvía 1450,7526).
   *
   * El redondeo del producto —y no la comparación directa contra el valor
   * escalado— es a propósito: `1450.7891 * 10000` da 14507891.000000002 en
   * coma flotante, así que un `Number.isInteger()` pelado rechazaría un TC de
   * cuatro decimales perfectamente válido.
   */
  .refine((rate) => Math.round(rate * 10 ** RATE_SCALE) / 10 ** RATE_SCALE === rate, {
    message: "El tipo de cambio admite hasta cuatro decimales.",
  })

export const exchangeRate = typedRate.refine((rate) => rate >= 0, {
  message: "El tipo de cambio no puede ser negativo.",
})

/**
 * Tipo de cambio de un movimiento o de un cambio de divisa que sí ocurrió:
 * tiene que ser mayor a cero. No confundir con `exchangeRate` (arriba), que
 * permite cero porque ahí el TC acompaña un saldo inicial que puede no tener
 * dólares.
 */
export const positiveRate = typedRate.refine((rate) => rate > 0, {
  message: "El tipo de cambio tiene que ser mayor a cero.",
})

export const settingsSchema = z
  .object({
    initialBalanceArsCents: amountCents,
    initialBalanceUsdCents: amountCents,
    /**
     * Costo en pesos por dólar de los dólares del saldo inicial. Sin esto la
     * posición en dólares (Task 15) arrancaría en cero mientras el saldo
     * inicial muestra dólares, y /cambios reportaría una sobreventa falsa.
     */
    initialBalanceUsdRate: exchangeRate,
    initialBalanceDate: isoDate,
    preferredRate: ratePreference,
  })
  .refine(
    (data) => data.initialBalanceUsdCents === 0 || data.initialBalanceUsdRate > 0,
    {
      message:
        "Si cargaste un saldo inicial en dólares, decinos a qué tipo de cambio los compraste.",
      path: ["initialBalanceUsdRate"],
    },
  )

export const currency = z.enum(["ARS", "USD"])

/**
 * Una cuota tal como llega del formulario.
 * A diferencia del importe total, la cuota YA viaja en centavos: la genera
 * `buildInstallments` del lado del cliente, que trabaja en centavos.
 */
export const installmentInput = z.object({
  amountCents: z.coerce.number().int().nonnegative(),
  dueDate: isoDate,
})

export const movementSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    description: z.string().trim().min(1, "Poné una descripción.").max(200),
    categoryId: z.string().min(1, "Elegí una categoría."),
    date: isoDate,
    currency: currency,
    /**
     * Mayor a cero, no sólo no-negativo: un movimiento de $0 no es un dato, es
     * una fila que después aparece en la torta y en las barras aportando nada.
     * La cota va acá y no en `amountCents` porque esa pieza la comparte
     * `settingsSchema`, donde el cero SÍ es válido (un saldo inicial sin
     * dólares). Mismo patrón que `exchangeSchema.usdCents`.
     */
    amountCents: amountCents.refine((c) => c > 0, "El importe tiene que ser mayor a cero."),
    rate: positiveRate,
    installments: z
      .array(installmentInput)
      .min(1, "Tiene que haber al menos una cuota.")
      .max(MAX_INSTALLMENTS, `No se pueden cargar más de ${MAX_INSTALLMENTS} cuotas.`),
  })
  .refine((m) => m.currency === "USD" || m.rate === 1, {
    message: "Un movimiento en pesos siempre lleva tipo de cambio 1.",
    path: ["rate"],
  })
  // La invariante vive en @/lib/installments, que es donde se reparte el total.
  // Reimplementarla acá la dejaría en dos lugares que pueden divergir en silencio.
  .refine(
    (m) => installmentsSumMatches(m.amountCents, m.installments.map((i) => i.amountCents)),
    {
      message: "La suma de las cuotas no coincide con el importe total.",
      path: ["installments"],
    },
  )

/**
 * Compra o venta de dólares. A diferencia de `movementSchema`, no lleva
 * `categoryId` ni `installments`: un cambio es instantáneo, mueve las dos
 * monedas de una y no genera cuotas.
 */
export const exchangeSchema = z.object({
  direction: z.enum(["buy", "sell"]),
  date: isoDate,
  usdCents: amountCents.refine((c) => c > 0, "Poné una cantidad mayor a cero."),
  rate: positiveRate,
})
