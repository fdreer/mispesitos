import { z } from "zod"

import { isValidIsoDate } from "@/lib/dates"
import { installmentsSumMatches } from "@/lib/installments"
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
 * Tipo de cambio: pesos por dólar. NO es un importe en centavos —es un decimal
 * común, así que no pasa por amountCents— pero lo tipea la misma persona, en el
 * mismo teclado y en un campo de texto pegado al del importe, así que se lee
 * con el mismo parser.
 *
 * Con `z.coerce.number()`, que por debajo es `Number()`, "1.450" se leía como
 * 1,45 pesos por dólar y "1.450,50" no se leía en absoluto.
 */
const typedRate = z.string().transform((value, ctx) => {
  const parsed = parseDecimalInput(value)
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "Escribí un tipo de cambio válido." })
    return z.NEVER
  }
  return parsed
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
    amountCents: amountCents,
    rate: positiveRate,
    installments: z.array(installmentInput).min(1, "Tiene que haber al menos una cuota."),
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

export type MovementInput = z.infer<typeof movementSchema>

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

export type ExchangeInput = z.infer<typeof exchangeSchema>
