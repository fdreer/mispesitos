import { z } from "zod"

import { parseAmountToCents } from "@/lib/money"

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

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha válida.")

export const ratePreference = z.enum(["oficial", "blue", "mep"])

/**
 * Tipo de cambio: pesos por dólar. NO es un importe en centavos —es un
 * decimal común, como el `rate` de un movimiento— por eso usa z.coerce.number()
 * y no amountCents/parseAmountToCents.
 */
export const exchangeRate = z.coerce
  .number({ error: "Escribí un tipo de cambio válido." })
  .nonnegative({ message: "El tipo de cambio no puede ser negativo." })

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

export const movementKind = z.enum(["income", "expense", "exchange"])
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
    rate: z.coerce.number().positive("El tipo de cambio tiene que ser mayor a cero."),
    installments: z.array(installmentInput).min(1, "Tiene que haber al menos una cuota."),
  })
  .refine((m) => m.currency === "USD" || m.rate === 1, {
    message: "Un movimiento en pesos siempre lleva tipo de cambio 1.",
    path: ["rate"],
  })
  .refine(
    (m) => m.installments.reduce((a, i) => a + i.amountCents, 0) === m.amountCents,
    {
      message: "La suma de las cuotas no coincide con el importe total.",
      path: ["installments"],
    },
  )

export type MovementInput = z.infer<typeof movementSchema>
