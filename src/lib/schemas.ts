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
