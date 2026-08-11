import { addMonthsClamped, type IsoDate } from "@/lib/dates"

/**
 * Techo de cuotas de un movimiento. La cota no es de negocio: es de volumen.
 * Cada cuota es una fila que se inserta en la misma transacción, y la cantidad
 * la elige el cliente. Sin techo, un POST armado a mano escribe las filas que
 * quiera. 120 son diez años de cuotas mensuales, más de lo que cualquier plan
 * real necesita.
 *
 * Vive acá y no en `schemas.ts` porque los dos lados tienen que usar el mismo
 * número —el `max` del input y el `.max()` del schema son la misma regla— y
 * éste es el módulo que ya comparten el formulario cliente y el schema
 * servidor. Importarlo desde `schemas.ts` metería zod en el bundle del
 * navegador para el precio de un entero.
 */
export const MAX_INSTALLMENTS = 120

export type PlannedInstallment = {
  number: number
  amountCents: number
  dueDate: IsoDate
}

/**
 * Reparte un total en `count` partes iguales; la última absorbe la diferencia.
 * Sección 5.1 del spec: $100,00 en 3 => 33,33 / 33,33 / 33,34.
 * La suma de las partes es SIEMPRE exactamente el total.
 */
export function splitAmount(totalCents: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`La cantidad de cuotas debe ser un entero mayor a cero, no ${count}`)
  }
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error(`El total debe ser un entero de centavos no negativo, no ${totalCents}`)
  }

  const base = Math.floor(totalCents / count)
  const parts = new Array<number>(count).fill(base)
  parts[count - 1] = totalCents - base * (count - 1)

  return parts
}

/**
 * Plan completo de cuotas: importes repartidos y vencimientos mensuales
 * a partir de la fecha de la primera.
 */
export function buildInstallments(
  totalCents: number,
  count: number,
  firstDueDate: IsoDate,
): PlannedInstallment[] {
  return splitAmount(totalCents, count).map((amountCents, index) => ({
    number: index + 1,
    amountCents,
    dueDate: addMonthsClamped(firstDueDate, index),
  }))
}

/**
 * Invariante de la sección 4 del spec: la suma de las cuotas es igual al total
 * del movimiento. Se valida en cada alta y en cada edición.
 */
export function installmentsSumMatches(totalCents: number, amounts: number[]): boolean {
  if (amounts.length === 0) return false
  return amounts.reduce((a, b) => a + b, 0) === totalCents
}
