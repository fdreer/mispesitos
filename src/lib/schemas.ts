import { z } from "zod"

import { isValidIsoDate } from "@/lib/dates"
import { installmentsSumMatches, MAX_INSTALLMENTS } from "@/lib/installments"
import { parseAmountToCents, parseDecimalInput } from "@/lib/money"

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

export const isoDate = z.string().refine(isValidIsoDate, "Elegí una fecha válida.")

export const ratePreference = z.enum(["oficial", "blue", "mep"])

const RATE_MAX = 99_999_999.9999
const RATE_SCALE = 4

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
  .refine((rate) => Math.abs(rate) <= RATE_MAX, {
    message: "El tipo de cambio no puede pasar de 99.999.999,9999.",
  })
  .refine((rate) => Math.round(rate * 10 ** RATE_SCALE) / 10 ** RATE_SCALE === rate, {
    message: "El tipo de cambio admite hasta cuatro decimales.",
  })

export const exchangeRate = typedRate.refine((rate) => rate >= 0, {
  message: "El tipo de cambio no puede ser negativo.",
})

export const positiveRate = typedRate.refine((rate) => rate > 0, {
  message: "El tipo de cambio tiene que ser mayor a cero.",
})

export const settingsSchema = z.object({
  initialBalanceArsCents: amountCents,
  initialBalanceUsdCents: amountCents,
  initialBalanceDate: isoDate,
  preferredRate: ratePreference,
})

export const currency = z.enum(["ARS", "USD"])

export const installmentInput = z.object({
  amountCents: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  ),
  dueDate: isoDate,
})

export const movementSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    description: z.string().trim().min(1, "Poné una descripción.").max(200),
    categoryId: z.string().min(1, "Elegí una categoría."),
    date: isoDate,
    currency: currency,
    amountCents: amountCents.refine((c) => c > 0, "El importe tiene que ser mayor a cero."),
    installments: z
      .array(installmentInput)
      .min(1, "Tiene que haber al menos una cuota.")
      .max(MAX_INSTALLMENTS, `No se pueden cargar más de ${MAX_INSTALLMENTS} cuotas.`),
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

/** Un día del mes, tal como lo tipea la persona: "25". */
const dayOfMonth = z.coerce
  .number("Elegí un día entre 1 y 31.")
  .int("Elegí un día entre 1 y 31.")
  .min(1, "Elegí un día entre 1 y 31.")
  .max(31, "Elegí un día entre 1 y 31.")

/** Un campo opcional de formulario: vacío o ausente es "sin valor". */
const optionalField = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional())

/**
 * Alta y edición de una tarjeta (§1.2 del plan v2). El color es una clave de
 * la misma paleta que las categorías; lo valida la acción, que es la que
 * importa la lista.
 */
export const cardSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre.").max(60, "Usá hasta 60 caracteres."),
  closingDay: dayOfMonth,
  dueDay: dayOfMonth,
  creditLimitCents: optionalField(
    amountCents.refine((c) => c > 0, "El límite tiene que ser mayor a cero."),
  ),
})

/**
 * Las fechas de un resumen, corregidas a mano cuando llega el resumen real.
 * El vencimiento no puede ser antes del cierre: lo exige también la CHECK
 * `card_statement_due_after_closing` (migración 0012); acá es para que el
 * error salga junto al campo.
 */
export const statementDatesSchema = z
  .object({
    closingDate: isoDate,
    dueDate: isoDate,
  })
  .refine((d) => d.dueDate >= d.closingDate, {
    message: "El vencimiento no puede ser antes del cierre.",
    path: ["dueDate"],
  })
